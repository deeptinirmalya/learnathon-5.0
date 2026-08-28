import type { Database } from 'better-sqlite3';
import { HttpError } from '../http/errors.ts';
import type {
	AttachmentRow,
	CommentRow,
	GrievanceRow,
	PublicGrievance,
	SessionUser,
	UserRow
} from '../types/index.ts';
import { toPublicAttachment, toPublicComment, toPublicGrievance, toPublicUser } from './map.ts';
import { randomUUID } from 'node:crypto';

export function findUserByEmail(db: Database, email: string): UserRow | undefined {
	return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function findUserById(db: Database, id: string): UserRow | undefined {
	return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createUser(
	db: Database,
	id: string,
	name: string,
	email: string,
	passwordHash: string,
	role: 'student' | 'warden',
	room: string | null
): void {
	db.prepare(
		`INSERT INTO users (id, name, email, password_hash, role, room, token_version, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
	).run(id, name, email, passwordHash, role, room);
}

export function userCount(db: Database): number {
	const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
	return row.n;
}

export function findGrievanceRow(db: Database, id: string): GrievanceRow | undefined {
	return db.prepare('SELECT * FROM grievances WHERE id = ?').get(id) as GrievanceRow | undefined;
}

export function listGrievanceRowsForStudent(db: Database, studentId: string): GrievanceRow[] {
	return db
		.prepare('SELECT * FROM grievances WHERE student_id = ? ORDER BY created_at DESC')
		.all(studentId) as GrievanceRow[];
}

export function listAllGrievanceRows(db: Database): GrievanceRow[] {
	return db.prepare('SELECT * FROM grievances ORDER BY created_at DESC').all() as GrievanceRow[];
}

export function listCommentRows(db: Database, grievanceId: string): CommentRow[] {
	return db
		.prepare('SELECT * FROM comments WHERE grievance_id = ? ORDER BY created_at ASC')
		.all(grievanceId) as CommentRow[];
}

export function listAttachmentRows(db: Database, grievanceId: string): AttachmentRow[] {
	return db
		.prepare('SELECT * FROM attachments WHERE grievance_id = ? ORDER BY created_at ASC')
		.all(grievanceId) as AttachmentRow[];
}

export function findAttachmentRow(db: Database, id: string): AttachmentRow | undefined {
	return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow | undefined;
}

export function assembleGrievance(db: Database, row: GrievanceRow): PublicGrievance {
	const studentRow = findUserById(db, row.student_id);
	if (!studentRow) {
		throw new HttpError(500, 'internal', 'Internal server error.');
	}
	const student = toPublicUser(studentRow);
	const attachments = listAttachmentRows(db, row.id).map(toPublicAttachment);
	const comments = listCommentRows(db, row.id).map((comment) => {
		const authorRow = findUserById(db, comment.author_id);
		if (!authorRow) {
			throw new HttpError(500, 'internal', 'Internal server error.');
		}
		return toPublicComment(comment, toPublicUser(authorRow));
	});
	return toPublicGrievance(row, student, attachments, comments);
}

export function requireGrievance(db: Database, id: string): GrievanceRow {
	const row = findGrievanceRow(db, id);
	if (!row) {
		throw new HttpError(404, 'not_found', 'Grievance was not found.');
	}
	return row;
}

export function assertCanViewGrievance(user: SessionUser, row: GrievanceRow): void {
	switch (user.role) {
		case 'warden':
			return;
		case 'student':
			if (row.student_id !== user.id) {
				throw new HttpError(403, 'unauthorized', 'You cannot access this grievance.');
			}
			return;
		default: {
			const _exhaustive: never = user.role;
			throw new HttpError(500, 'internal', 'Internal server error.');
			void _exhaustive;
		}
	}
}

import { randomBytes } from 'node:crypto';

function nextPrefixedId(db: Database, table: 'grievances' | 'comments' | 'attachments', prefix: string): string {
	// Fallback/unused but kept for compatibility
	const rows = db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[];
	let max = 0;
	for (const row of rows) {
		if (!row.id.startsWith(prefix)) continue;
		const n = Number.parseInt(row.id.slice(prefix.length), 10);
		if (!Number.isNaN(n) && n > max) max = n;
	}
	return `${prefix}${String(max + 1).padStart(prefix === 'GRV-' ? 4 : 0, '0')}`;
}

export function nextGrievanceId(db: Database): string {
	// GRV- followed by a random 8-digit number to satisfy /^GRV-\d{4,}$/
	// We check for uniqueness to prevent collisions
	while (true) {
		const randomNum = Math.floor(10000000 + Math.random() * 90000000);
		const id = `GRV-${randomNum}`;
		const exists = db.prepare('SELECT 1 FROM grievances WHERE id = ?').get(id);
		if (!exists) return id;
	}
}

export function nextCommentId(db: Database): string {
	while (true) {
		const suffix = randomBytes(8).toString('hex');
		const id = `cmt-${suffix}`;
		const exists = db.prepare('SELECT 1 FROM comments WHERE id = ?').get(id);
		if (!exists) return id;
	}
}

export function nextAttachmentId(db: Database): string {
	while (true) {
		const suffix = randomBytes(8).toString('hex');
		const id = `att-${suffix}`;
		const exists = db.prepare('SELECT 1 FROM attachments WHERE id = ?').get(id);
		if (!exists) return id;
	}
}

export function touchGrievance(db: Database, id: string, updatedAt: string): void {
	db.prepare('UPDATE grievances SET updated_at = ? WHERE id = ?').run(updatedAt, id);
}

// --- JWT Auth DB Helpers ---

export function isTokenBlacklisted(db: Database, jti: string): boolean {
	const row = db.prepare('SELECT jti FROM token_blacklist WHERE jti = ? AND expires_at > ?').get(jti, new Date().toISOString());
	return !!row;
}

export function blacklistToken(db: Database, jti: string, expiresAt: string): void {
	db.prepare('INSERT OR IGNORE INTO token_blacklist (jti, expires_at) VALUES (?, ?)').run(jti, expiresAt);
}

export function logLoginHistory(db: Database, userId: string, ip: string, userAgent: string, country: string, riskScore: number): void {
	db.prepare(
		'INSERT INTO login_history (id, user_id, ip_address, user_agent, country, risk_score, login_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).run(randomUUID(), userId, ip, userAgent, country, riskScore, new Date().toISOString());
}

export function saveRefreshToken(db: Database, userId: string, tokenHash: string, expiresAt: string, ip: string, userAgent: string): void {
	db.prepare(
		'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
	).run(randomUUID(), userId, tokenHash, expiresAt, ip, userAgent);
}

export function getRefreshTokensForUser(db: Database, userId: string): any[] {
	return db.prepare('SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0').all(userId);
}

export function revokeRefreshToken(db: Database, id: string): void {
	db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(id);
}

export function revokeAllRefreshTokensForUser(db: Database, userId: string): void {
	db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
}

export function incrementUserTokenVersion(db: Database, userId: string): void {
	db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}
