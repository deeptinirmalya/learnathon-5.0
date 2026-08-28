import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireJwtAuth } from '../auth/jwt.ts';
import {
	assembleGrievance,
	findUserById,
	listAllGrievanceRows,
	listCommentRows,
	listGrievanceRowsForStudent,
	nextAttachmentId,
	nextCommentId,
	nextGrievanceId,
	requireGrievance,
	assertCanViewGrievance,
	touchGrievance
} from '../db/queries.ts';
import type { CommentRow, AttachmentRow, GrievanceStatusDb } from '../types/index.ts';
import { toPublicAttachment, toPublicComment, toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { parseCategory, statusToDb } from '../http/status.ts';
import {
	bufferFromUpload,
	newStoredName,
	originalBasename,
	uploadToR2
} from '../storage/attachments.ts';
import { rateLimiter } from '../http/rate_limit.ts';
import {
	validateCommentBody,
	validateDescription,
	validateGrievanceId,
	validateResourceId,
	validateString,
	validateTitle
} from '../validation/validate.ts';
import { R2_PUBLIC_DOMAIN } from '../config.ts';

function nowIso(): string {
	return new Date().toISOString();
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export const grievanceRoutes = new Hono<AppEnv>();

// ─── GET /grievances ──────────────────────────────────────────────────────────

grievanceRoutes.get('/', async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const rows =
		user.role === 'warden' ? listAllGrievanceRows(db) : listGrievanceRowsForStudent(db, user.id);
	return c.json({
		data: rows.map((row) => assembleGrievance(db, row))
	});
});

// ─── POST /grievances ─────────────────────────────────────────────────────────

grievanceRoutes.post('/', rateLimiter({ maxTokens: 10, refillRate: 0.5, mode: 'both' }), async (c) => {
	const db = c.get('db');
	const uploadsDir = c.get('uploadsDir');
	const user = await requireJwtAuth(c, db);
	if (user.role !== 'student') {
		throw new HttpError(403, 'unauthorized', 'Only students can file grievances.');
	}

	const contentType = c.req.header('content-type') ?? '';
	let rawTitle: unknown = '';
	let rawCategory: unknown = '';
	let rawDescription: unknown = '';
	let upload: File | undefined;

	if (contentType.includes('multipart/form-data')) {
		const body = await c.req.parseBody();
		rawTitle = readString(body.title) ?? '';
		rawCategory = readString(body.category) ?? '';
		rawDescription = readString(body.description) ?? '';
		if (body.file instanceof File) upload = body.file;
		else if (body.attachment instanceof File) upload = body.attachment;
	} else {
		let json: unknown;
		try {
			json = await c.req.json();
		} catch {
			throw new HttpError(400, 'bad_request', 'Request body must be JSON or multipart form data.');
		}
		if (!json || typeof json !== 'object') {
			throw new HttpError(400, 'bad_request', 'Request body must be JSON or multipart form data.');
		}
		rawTitle = 'title' in json ? json.title : '';
		rawCategory = 'category' in json ? json.category : '';
		rawDescription = 'description' in json ? json.description : '';
	}

	// ── Validate all text fields ──────────────────────────────────────────────
	const title = validateTitle(rawTitle);
	const description = validateDescription(rawDescription);
	const category = parseCategory(validateString('Category', rawCategory, 1, 64));

	let validatedFile: { bytes: Buffer; mime: string; url: string; original: string } | null = null;
	if (upload) {
		const { bytes, mime } = await bufferFromUpload(upload);
		const stored = newStoredName(mime);
		await uploadToR2(stored, bytes, mime);
		const fileUrl = `https://${R2_PUBLIC_DOMAIN}/${stored}`;
		validatedFile = { bytes, mime, url: fileUrl, original: originalBasename(upload.name) };
	}

	const id = nextGrievanceId(db);
	const ts = nowIso();
	
	db.transaction(() => {
		db.prepare(
			`INSERT INTO grievances (id, student_id, title, category, description, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
		).run(id, user.id, title, category, description, ts, ts);

		if (validatedFile) {
			db.prepare(
				`INSERT INTO attachments (id, grievance_id, original_filename, url, mime_type, created_at)
		   VALUES (?, ?, ?, ?, ?, ?)`
			).run(
				nextAttachmentId(db),
				id,
				validatedFile.original,
				validatedFile.url,
				validatedFile.mime,
				ts
			);
		}
	})();

	return c.json({ data: assembleGrievance(db, requireGrievance(db, id)) }, 201);
});

// ─── GET /grievances/:id/comments ────────────────────────────────────────────

grievanceRoutes.get('/:id/comments', async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const grievanceId = validateGrievanceId(c.req.param('id'));
	const row = requireGrievance(db, grievanceId);
	// Check authorization
	assertCanViewGrievance(user as any, row);
	const comments = listCommentRows(db, row.id).map((comment) => {
		const authorRow = findUserById(db, comment.author_id);
		if (!authorRow) {
			throw new HttpError(500, 'internal', 'Internal server error.');
		}
		return toPublicComment(comment, toPublicUser(authorRow));
	});
	return c.json({ data: comments });
});

// ─── POST /grievances/:id/comments ───────────────────────────────────────────

grievanceRoutes.post('/:id/comments', rateLimiter({ maxTokens: 10, refillRate: 0.5, mode: 'both' }), async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const grievanceId = validateGrievanceId(c.req.param('id'));
	const row = requireGrievance(db, grievanceId);
	// Check authorization
	assertCanViewGrievance(user as any, row);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'JSON body is required.');
	}

	// ── Validate comment body ─────────────────────────────────────────────────
	const text = validateCommentBody(
		body && typeof body === 'object' && 'body' in body ? body.body : undefined
	);

	const id = nextCommentId(db);
	const ts = nowIso();
	db.prepare(
		`INSERT INTO comments (id, grievance_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)`
	).run(id, row.id, user.id, text, ts);
	touchGrievance(db, row.id, ts);

	const author = findUserById(db, user.id);
	if (!author) {
		throw new HttpError(500, 'internal', 'Internal server error.');
	}
	const commentRow = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
	return c.json({ data: toPublicComment(commentRow, toPublicUser(author)) }, 201);
});

// ─── POST /grievances/:id/attachments ────────────────────────────────────────

grievanceRoutes.post('/:id/attachments', rateLimiter({ maxTokens: 10, refillRate: 0.5, mode: 'both' }), async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const grievanceId = validateGrievanceId(c.req.param('id'));
	const row = requireGrievance(db, grievanceId);
	// Check authorization
	assertCanViewGrievance(user as any, row);
	if (user.role !== 'student' || row.student_id !== user.id) {
		throw new HttpError(403, 'unauthorized', 'Only the student owner can add attachments.');
	}
	if (row.status === 'resolved') {
		throw new HttpError(409, 'conflict', 'Resolved grievances cannot be edited.');
	}

	const body = await c.req.parseBody();
	const upload =
		body.file instanceof File
			? body.file
			: body.attachment instanceof File
				? body.attachment
				: undefined;
	if (!upload) {
		throw new HttpError(400, 'bad_request', 'A file field named file is required.');
	}

	const { bytes, mime } = await bufferFromUpload(upload);
	const stored = newStoredName(mime);
	await uploadToR2(stored, bytes, mime);
	const fileUrl = `https://${R2_PUBLIC_DOMAIN}/${stored}`;
	const ts = nowIso();
	const id = nextAttachmentId(db);
	db.transaction(() => {
		db.prepare(
			`INSERT INTO attachments (id, grievance_id, original_filename, url, mime_type, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`
		).run(id, row.id, originalBasename(upload.name), fileUrl, mime, ts);
		touchGrievance(db, row.id, ts);
	})();
	const saved = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow;
	return c.json({ data: toPublicAttachment(saved) }, 201);
});

// ─── GET /grievances/:id ─────────────────────────────────────────────────────

grievanceRoutes.get('/:id', async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const grievanceId = validateGrievanceId(c.req.param('id'));
	const row = requireGrievance(db, grievanceId);
	// Check authorization
	assertCanViewGrievance(user as any, row);
	return c.json({ data: assembleGrievance(db, row) });
});

// ─── PATCH /grievances/:id ───────────────────────────────────────────────────

grievanceRoutes.patch('/:id', rateLimiter({ maxTokens: 10, refillRate: 0.5, mode: 'both' }), async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const grievanceId = validateGrievanceId(c.req.param('id'));
	const row = requireGrievance(db, grievanceId);
	// Check authorization
	assertCanViewGrievance(user as any, row);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const title = 'title' in body ? body.title : undefined;
	const description = 'description' in body ? body.description : undefined;
	const category = 'category' in body ? body.category : undefined;
	const status = 'status' in body ? body.status : undefined;
	const wantsContent = title !== undefined || description !== undefined || category !== undefined;
	const wantsStatus = status !== undefined;

	if (!wantsContent && !wantsStatus) {
		throw new HttpError(400, 'bad_request', 'No updatable fields were provided.');
	}

	switch (user.role) {
		case 'student': {
			if (row.status === 'resolved') {
				throw new HttpError(409, 'conflict', 'Resolved grievances cannot be edited.');
			}
			let nextTitle = row.title;
			let nextDescription = row.description;
			let nextCategory = row.category;
			let nextStatus: GrievanceStatusDb = row.status;

			// ── Validate each provided field ───────────────────────────────────
			if (title !== undefined) {
				nextTitle = validateTitle(title);
			}
			if (description !== undefined) {
				nextDescription = validateDescription(description);
			}
			if (category !== undefined) {
				nextCategory = parseCategory(validateString('Category', category, 1, 64));
			}
			if (status !== undefined) {
				if (typeof status !== 'string') {
					throw new HttpError(400, 'bad_request', 'Invalid grievance status.');
				}
				nextStatus = statusToDb(status);
			}
			const ts = nowIso();
			db.prepare(
				'UPDATE grievances SET title = ?, description = ?, category = ?, status = ?, updated_at = ? WHERE id = ?'
			).run(nextTitle, nextDescription, nextCategory, nextStatus, ts, row.id);
			break;
		}
		case 'warden': {
			if (wantsContent) {
				throw new HttpError(403, 'unauthorized', 'Wardens cannot edit grievance content.');
			}
			if (typeof status !== 'string') {
				throw new HttpError(400, 'bad_request', 'Invalid grievance status.');
			}
			const nextStatus = statusToDb(status);
			const ts = nowIso();
			db.prepare('UPDATE grievances SET status = ?, updated_at = ? WHERE id = ?').run(
				nextStatus,
				ts,
				row.id
			);
			break;
		}
		default: {
			const _exhaustive: never = user.role;
			throw new HttpError(500, 'internal', 'Internal server error.');
			void _exhaustive;
		}
	}

	return c.json({ data: assembleGrievance(db, requireGrievance(db, row.id)) });
});
