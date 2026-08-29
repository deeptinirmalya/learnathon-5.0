import type { PrismaClient, User, Grievance, Comment, Attachment } from '@prisma/client';
import { HttpError } from '../http/errors.ts';
import type { PublicGrievance, SessionUser } from '../types/index.ts';
import { toPublicAttachment, toPublicComment, toPublicGrievance, toPublicUser } from './map.ts';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

/** Hash a refresh token (JWT string) with SHA-256 for safe storage. */
export function hashRefreshToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export type UserRow = User;
export type GrievanceRow = Grievance;
export type CommentRow = Comment;
export type AttachmentRow = Attachment;

export async function findUserByEmail(db: PrismaClient, email: string): Promise<UserRow | null> {
	return db.user.findUnique({ where: { email } });
}

export async function findUserById(db: PrismaClient, id: string): Promise<UserRow | null> {
	return db.user.findUnique({ where: { id } });
}

export async function createUser(
	db: PrismaClient,
	id: string,
	name: string,
	email: string,
	passwordHash: string,
	role: 'student' | 'warden' | 'admin',
	room: string | null
): Promise<void> {
	await db.user.create({
		data: {
			id,
			name,
			email,
			passwordHash,
			role,
			room,
			tokenVersion: 1,
			createdAt: new Date().toISOString()
		}
	});
}

export async function userCount(db: PrismaClient): Promise<number> {
	return db.user.count();
}

export async function listAllUsers(db: PrismaClient): Promise<UserRow[]> {
	return db.user.findMany({
		orderBy: { createdAt: 'desc' }
	});
}

export async function updateUserPassword(db: PrismaClient, id: string, newPasswordHash: string): Promise<void> {
	await db.user.update({
		where: { id },
		data: { passwordHash: newPasswordHash, tokenVersion: { increment: 1 } }
	});
}

export async function deleteUser(db: PrismaClient, id: string): Promise<void> {
	await db.$transaction([
		db.comment.deleteMany({ where: { authorId: id } }),
		db.user.delete({ where: { id } })
	]);
}

export async function findGrievanceRow(db: PrismaClient, id: string): Promise<GrievanceRow | null> {
	return db.grievance.findUnique({ where: { id } });
}

export async function listGrievanceRowsForStudent(db: PrismaClient, studentId: string): Promise<GrievanceRow[]> {
	return db.grievance.findMany({
		where: { studentId },
		orderBy: { createdAt: 'desc' }
	});
}

export async function listAllGrievanceRows(db: PrismaClient): Promise<GrievanceRow[]> {
	return db.grievance.findMany({
		orderBy: { createdAt: 'desc' }
	});
}

export async function listCommentRows(db: PrismaClient, grievanceId: string): Promise<CommentRow[]> {
	return db.comment.findMany({
		where: { grievanceId },
		orderBy: { createdAt: 'asc' }
	});
}

export async function listAttachmentRows(db: PrismaClient, grievanceId: string): Promise<AttachmentRow[]> {
	return db.attachment.findMany({
		where: { grievanceId },
		orderBy: { createdAt: 'asc' }
	});
}

export async function findAttachmentRow(db: PrismaClient, id: string): Promise<AttachmentRow | null> {
	return db.attachment.findUnique({ where: { id } });
}

export async function assembleGrievance(db: PrismaClient, row: GrievanceRow): Promise<PublicGrievance> {
	const studentRow = await findUserById(db, row.studentId);
	if (!studentRow) throw new HttpError(500, 'internal', 'Internal server error.');
	const student = toPublicUser(studentRow);
	
	const attachmentRows = await listAttachmentRows(db, row.id);
	const attachments = attachmentRows.map(toPublicAttachment);
	
	const commentRows = await listCommentRows(db, row.id);
	const comments = await Promise.all(commentRows.map(async (comment) => {
		const authorRow = await findUserById(db, comment.authorId);
		if (!authorRow) throw new HttpError(500, 'internal', 'Internal server error.');
		return toPublicComment(comment, toPublicUser(authorRow));
	}));
	
	return toPublicGrievance(row, student, attachments, comments);
}

export async function requireGrievance(db: PrismaClient, id: string): Promise<GrievanceRow> {
	const row = await findGrievanceRow(db, id);
	if (!row) throw new HttpError(404, 'not_found', 'Grievance was not found.');
	return row;
}

export function assertCanViewGrievance(user: SessionUser, row: GrievanceRow): void {
	switch (user.role) {
		case 'warden':
		case 'admin':
			return;
		case 'student':
			if (row.studentId !== user.id) {
				throw new HttpError(403, 'unauthorized', 'You cannot access this grievance.');
			}
			return;
		default: {
			const _exhaustive: never = user.role;
			throw new HttpError(500, 'internal', 'Internal server error.');
		}
	}
}

export async function nextGrievanceId(db: PrismaClient): Promise<string> {
	while (true) {
		const randomNum = Math.floor(1000 + Math.random() * 9000);
		const id = `GRV-${randomNum}`;
		const exists = await db.grievance.findUnique({ where: { id } });
		if (!exists) return id;
	}
}

export async function nextCommentId(db: PrismaClient): Promise<string> {
	while (true) {
		const suffix = randomBytes(8).toString('hex');
		const id = `cmt-${suffix}`;
		const exists = await db.comment.findUnique({ where: { id } });
		if (!exists) return id;
	}
}

export async function nextAttachmentId(db: PrismaClient): Promise<string> {
	while (true) {
		const suffix = randomBytes(8).toString('hex');
		const id = `att-${suffix}`;
		const exists = await db.attachment.findUnique({ where: { id } });
		if (!exists) return id;
	}
}

export async function touchGrievance(db: PrismaClient, id: string, updatedAt: string): Promise<void> {
	await db.grievance.update({
		where: { id },
		data: { updatedAt }
	});
}

// --- JWT Auth DB Helpers ---

export async function isTokenBlacklisted(db: PrismaClient, jti: string): Promise<boolean> {
	const row = await db.tokenBlacklist.findFirst({
		where: {
			jti,
			expiresAt: { gt: new Date().toISOString() }
		}
	});
	return !!row;
}

export async function blacklistToken(db: PrismaClient, jti: string, expiresAt: string): Promise<void> {
	try {
		await db.tokenBlacklist.upsert({
			where: { jti },
			update: { expiresAt },
			create: { jti, expiresAt }
		});
	} catch (error: any) {
		if (error?.code !== 'P2002') {
			throw error;
		}
		await db.tokenBlacklist.update({
			where: { jti },
			data: { expiresAt }
		});
	}
}

/**
 * Calculate risk score for a login attempt.
 * Factors:
 * - New IP/User-Agent combination: +40 points
 * - Rapid login attempts (3+ in 5 minutes): +35 points
 * - No prior login history: +25 points
 */
export async function calculateRiskScore(
	db: PrismaClient,
	userId: string,
	ip: string,
	userAgent: string
): Promise<number> {
	let riskScore = 0;

	// Fetch login history for this user
	const recentLogins = await db.loginHistory.findMany({
		where: { userId },
		orderBy: { loginAt: 'desc' },
		take: 10
	});

	// Factor 1: No prior login history (first login ever)
	if (recentLogins.length === 0) {
		riskScore += 25;
	}

	// Factor 2: Check if this IP/User-Agent combination is new
	const deviceSeen = recentLogins.some(
		(login) => login.ipAddress === ip && login.userAgent === userAgent
	);
	if (!deviceSeen && recentLogins.length > 0) {
		riskScore += 40;
	}

	// Factor 3: Check for rapid login attempts (brute force indicator)
	const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
	const recentAttempts = await db.loginHistory.count({
		where: {
			userId,
			loginAt: { gte: fiveMinutesAgo }
		}
	});
	if (recentAttempts >= 3) {
		riskScore += 35;
	}

	return riskScore;
}

export async function logLoginHistory(db: PrismaClient, userId: string, ip: string, userAgent: string, country: string, riskScore: number): Promise<void> {
	await db.loginHistory.create({
		data: {
			id: randomUUID(),
			userId,
			ipAddress: ip,
			userAgent,
			country,
			riskScore,
			loginAt: new Date().toISOString()
		}
	});
}

export async function saveRefreshToken(db: PrismaClient, userId: string, rawToken: string, expiresAt: string, ip: string, userAgent: string): Promise<void> {
	await db.refreshToken.create({
		data: {
			id: randomUUID(),
			userId,
			tokenHash: hashRefreshToken(rawToken),
			expiresAt,
			ipAddress: ip,
			userAgent
		}
	});
}

export async function getRefreshTokensForUser(db: PrismaClient, userId: string): Promise<any[]> {
	return db.refreshToken.findMany({
		where: { userId, revoked: 0 }
	});
}

export async function revokeRefreshToken(db: PrismaClient, id: string): Promise<void> {
	await db.refreshToken.update({
		where: { id },
		data: { revoked: 1 }
	});
}

export async function revokeAllRefreshTokensForUser(db: PrismaClient, userId: string): Promise<void> {
	await db.refreshToken.updateMany({
		where: { userId },
		data: { revoked: 1 }
	});
}

export async function incrementUserTokenVersion(db: PrismaClient, userId: string): Promise<void> {
	await db.user.update({
		where: { id: userId },
		data: { tokenVersion: { increment: 1 } }
	});
}
