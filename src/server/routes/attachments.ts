import { Hono } from 'hono';
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
	
	return c.redirect(row.url);
});
