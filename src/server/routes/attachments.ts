import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppEnv } from '../env.ts';
import { requireJwtAuth } from '../auth/jwt.ts';
import { findAttachmentRow, requireGrievance, assertCanViewGrievance } from '../db/queries.ts';
import { HttpError } from '../http/errors.ts';
import { validateResourceId } from '../validation/validate.ts';

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.get('/:id', async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	const attachmentId = validateResourceId(c.req.param('id'));
	const row = await findAttachmentRow(db, attachmentId);
	if (!row) {
		throw new HttpError(404, 'not_found', 'Attachment was not found.');
	}

	const grievance = await requireGrievance(db, row.grievanceId);
	assertCanViewGrievance(user as any, grievance);

	if (row.url.startsWith('http://') || row.url.startsWith('https://')) {
		try {
			const upstream = await fetch(row.url);
			if (upstream.ok) {
				const buffer = await upstream.arrayBuffer();
				return new Response(buffer, {
					status: 200,
					headers: {
						'Content-Type': row.mimeType,
						'Content-Disposition': `inline; filename="${row.originalFilename}"`,
						'X-Content-Type-Options': 'nosniff',
						'Cache-Control': 'private, no-cache, no-store, must-revalidate'
					}
				});
			}
		} catch {
			// Fallback to redirect if upstream fetch fails
		}
		return c.redirect(row.url);
	}

	const uploadsDir = c.get('uploadsDir');
	if (uploadsDir) {
		const localPath = join(uploadsDir, row.url);
		if (existsSync(localPath)) {
			const bytes = readFileSync(localPath);
			return new Response(bytes, {
				status: 200,
				headers: {
					'Content-Type': row.mimeType,
					'Content-Disposition': `inline; filename="${row.originalFilename}"`,
					'X-Content-Type-Options': 'nosniff',
					'Cache-Control': 'private, no-cache, no-store, must-revalidate'
				}
			});
		}
	}

	return c.redirect(row.url);
});

