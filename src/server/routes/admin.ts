import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { HttpError } from '../http/errors.ts';
import { validateEmail, validatePassword, validateName, validateResourceId } from '../validation/validate.ts';
import { findUserByEmail, createUser, findUserById, listAllUsers, updateUserPassword, deleteUser, revokeAllRefreshTokensForUser } from '../db/queries.ts';
import { hashPassword, verifyPassword } from '../auth/passwords.ts';
import { toPublicUser } from '../db/map.ts';
import { randomUUID } from 'node:crypto';
import { requireJwtAuth } from '../auth/jwt.ts';
import { rateLimiter } from '../http/rate_limit.ts';

export const adminRoutes = new Hono<AppEnv>();

// Middleware to enforce JWT admin authentication
adminRoutes.use('*', async (c, next) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	if (user.role !== 'admin') {
		throw new HttpError(403, 'forbidden', 'Only administrators can access this resource.');
	}
	await next();
});

adminRoutes.get('/users', async (c) => {
	const db = c.get('db');
	const users = await listAllUsers(db);
	return c.json({ users: users.map(toPublicUser) });
});

adminRoutes.get('/wardens', async (c) => {
	const db = c.get('db');
	const users = await listAllUsers(db);
	return c.json({ wardens: users.filter((u) => u.role === 'warden').map(toPublicUser) });
});

// Change the calling admin's own password (requires the current password).
adminRoutes.patch('/password', rateLimiter({ maxTokens: 5, refillRate: 0.1, mode: 'user' }), async (c) => {
	const db = c.get('db');
	const me = c.get('user')!;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const currentPassword = 'currentPassword' in body ? body.currentPassword : undefined;
	const newPassword = 'newPassword' in body ? body.newPassword : undefined;
	if (typeof currentPassword !== 'string' || !currentPassword) {
		throw new HttpError(400, 'bad_request', 'Current password is required.');
	}

	const row = await findUserById(db, me.id);
	if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
		throw new HttpError(401, 'unauthenticated', 'Current password is incorrect.');
	}

	const nextPassword = validatePassword(newPassword);
	await updateUserPassword(db, me.id, hashPassword(nextPassword));
	await revokeAllRefreshTokensForUser(db, me.id);

	return c.json({ success: true, message: 'Password changed. You will be logged out of existing sessions.' });
});

adminRoutes.post('/wardens', rateLimiter({ maxTokens: 5, refillRate: 0.1, mode: 'ip' }), async (c) => {
	const db = c.get('db');
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const name = validateName('name' in body ? body.name : undefined);
	const email = validateEmail('email' in body ? body.email : undefined);
	const password = validatePassword('password' in body ? body.password : undefined);

	const existing = await findUserByEmail(db, email);
	if (existing) {
		throw new HttpError(409, 'conflict', 'A user with this email address already exists.');
	}

	const id = `war-${randomUUID().slice(0, 8)}`;
	const passwordHash = hashPassword(password);

	await createUser(db, id, name, email, passwordHash, 'warden', null);

	const newUser = await findUserById(db, id);
	if (!newUser) {
		throw new HttpError(500, 'internal', 'Failed to create warden account.');
	}

	return c.json({ success: true, user: toPublicUser(newUser) }, 201);
});

adminRoutes.patch('/users/:id/password', rateLimiter({ maxTokens: 5, refillRate: 0.1, mode: 'user' }), async (c) => {
	const db = c.get('db');
	const me = c.get('user')!;
	const id = validateResourceId(c.req.param('id'));

	if (id === me.id) {
		throw new HttpError(400, 'bad_request', 'Use the "change my password" action for your own account.');
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	if (!body || typeof body !== 'object' || !('password' in body)) {
		throw new HttpError(400, 'bad_request', 'Password is required.');
	}

	const password = validatePassword(body.password);
	const targetUser = await findUserById(db, id);

	if (!targetUser) {
		throw new HttpError(404, 'not_found', 'User not found.');
	}
	if (targetUser.role !== 'warden') {
		throw new HttpError(409, 'conflict', 'Passwords can only be reset for warden accounts.');
	}

	const newPasswordHash = hashPassword(password);
	await updateUserPassword(db, id, newPasswordHash);
	await revokeAllRefreshTokensForUser(db, id);

	return c.json({ success: true, message: 'Password updated successfully. User will be logged out of existing sessions.' });
});

adminRoutes.delete('/users/:id', rateLimiter({ maxTokens: 5, refillRate: 0.1, mode: 'user' }), async (c) => {
	const db = c.get('db');
	const me = c.get('user')!;
	const id = validateResourceId(c.req.param('id'));

	if (id === me.id) {
		throw new HttpError(403, 'forbidden', 'You cannot remove your own account.');
	}

	const targetUser = await findUserById(db, id);
	if (!targetUser) {
		throw new HttpError(404, 'not_found', 'User not found.');
	}

	if (targetUser.role !== 'warden') {
		throw new HttpError(409, 'conflict', 'Only warden accounts can be removed.');
	}

	await deleteUser(db, id);

	return c.json({ success: true, message: 'Warden removed.' });
});
