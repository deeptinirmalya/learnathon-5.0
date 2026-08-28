import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { createSession, clearSessionCookie, requireUser, setSessionCookie } from '../auth/session.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { findUserByEmail } from '../db/queries.ts';
import { toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { validateEmail, validatePassword } from '../validation/validate.ts';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
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

	// Validate inputs before touching the database
	const email = validateEmail('email' in body ? body.email : undefined);
	const password = validatePassword('password' in body ? body.password : undefined);

	const user = findUserByEmail(db, email);
	// Always run verifyPassword even on missing user to prevent timing-based email enumeration
	const passwordOk = user ? verifyPassword(password, user.password_hash) : false;
	if (!user || !passwordOk) {
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}
	const token = createSession(db, user.id);
	setSessionCookie(c, token);
	return c.json({ user: toPublicUser(user) });
});

authRoutes.post('/logout', (c) => {
	clearSessionCookie(c);
	return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	return c.json({ user: toPublicUser(user) });
});
