import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { verifyPassword, hashPassword } from '../auth/passwords.ts';
import {
	findUserByEmail,
	logLoginHistory,
	saveRefreshToken,
	blacklistToken,
	revokeAllRefreshTokensForUser,
	incrementUserTokenVersion,
	getRefreshTokensForUser,
	revokeRefreshToken,
	findUserById,
	createUser
} from '../db/queries.ts';
import { toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { validateEmail, validatePassword, validateName, validateRoom } from '../validation/validate.ts';
import { randomUUID } from 'node:crypto';
import {
	createAccessToken,
	createRefreshToken,
	getClientInfo,
	generateFingerprint,
	requireJwtAuth,
	ACCESS_TOKEN_EXP_MINUTES,
	REFRESH_TOKEN_EXP_DAYS
} from '../auth/jwt.ts';
import { verify as verifyJwt } from 'hono/jwt';
import {
	getCookieSettings,
	JWT_SECRET,
	ACCESS_TOKEN_COOKIE_NAME,
	REFRESH_TOKEN_COOKIE_NAME
} from '../config.ts';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { rateLimiter } from '../http/rate_limit.ts';

export const authRoutes = new Hono<AppEnv>();

const DUMMY_HASH =
	'scrypt:00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

authRoutes.post('/login', rateLimiter({ maxTokens: 5, refillRate: 0.1, mode: 'login' }), async (c) => {
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

	const email = validateEmail('email' in body ? body.email : undefined);
	const password = validatePassword('password' in body ? body.password : undefined);

	const user = await findUserByEmail(db, email);
	
	const targetHash = user ? user.passwordHash : DUMMY_HASH; // Note: passwordHash is camelCase in Prisma
	const passwordOk = verifyPassword(password, targetHash);

	if (!user || !passwordOk) {
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}

	const client = getClientInfo(c);
	const riskScore = 0; 
	await logLoginHistory(db, user.id, client.ip, client.userAgent, client.country, riskScore);

	if (riskScore >= 100) {
		throw new HttpError(403, 'forbidden', 'Risk too high. Blocked for security.');
	}

	const jti = randomUUID();
	const fingerprint = generateFingerprint(client.ip, client.userAgent);
	
	const accessToken = await createAccessToken(
		user.id,
		user.role,
		'active', 
		jti,
		fingerprint,
		user.tokenVersion
	);
	
	const refreshTokenStr = await createRefreshToken(user.id);

	await saveRefreshToken(
		db,
		user.id,
		refreshTokenStr, 
		new Date(Date.now() + REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60 * 1000).toISOString(),
		client.ip,
		client.userAgent
	);

	setCookie(c, ACCESS_TOKEN_COOKIE_NAME, accessToken, getCookieSettings(ACCESS_TOKEN_EXP_MINUTES * 60));
	setCookie(c, REFRESH_TOKEN_COOKIE_NAME, refreshTokenStr, getCookieSettings(REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60));

	return c.json({ user: toPublicUser(user) });
});

authRoutes.post('/refresh', rateLimiter({ maxTokens: 10, refillRate: 1.0, mode: 'ip' }), async (c) => {
	const db = c.get('db');
	const refreshTokenCookie = getCookie(c, REFRESH_TOKEN_COOKIE_NAME);
	
	if (!refreshTokenCookie) {
		throw new HttpError(401, 'unauthenticated', 'Refresh token missing');
	}

	let payload: any;
	try {
		payload = await verifyJwt(refreshTokenCookie, JWT_SECRET, 'HS256');
	} catch (err) {
		throw new HttpError(401, 'unauthenticated', 'Invalid refresh session');
	}

	const userId = payload.user_id;
	const allTokens = await getRefreshTokensForUser(db, userId);
	
	const matchingToken = allTokens.find((t) => t.tokenHash === refreshTokenCookie);
	
	if (!matchingToken) {
		throw new HttpError(401, 'unauthenticated', 'Session not found');
	}

	if (matchingToken.revoked) {
		await revokeAllRefreshTokensForUser(db, userId);
		throw new HttpError(403, 'forbidden', 'Security breach detected. All sessions revoked.');
	}

	const user = await findUserById(db, userId);
	if (!user) {
		throw new HttpError(403, 'forbidden', 'Account restricted');
	}

	const client = getClientInfo(c);
	await logLoginHistory(db, user.id, client.ip, client.userAgent, client.country, 0);

	await revokeRefreshToken(db, matchingToken.id);

	const newJti = randomUUID();
	const fingerprint = generateFingerprint(client.ip, client.userAgent);
	
	const newAccessToken = await createAccessToken(
		user.id,
		user.role,
		'active',
		newJti,
		fingerprint,
		user.tokenVersion
	);
	const newRefreshToken = await createRefreshToken(user.id);

	await saveRefreshToken(
		db,
		user.id,
		newRefreshToken,
		new Date(Date.now() + REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60 * 1000).toISOString(),
		client.ip,
		client.userAgent
	);

	setCookie(c, ACCESS_TOKEN_COOKIE_NAME, newAccessToken, getCookieSettings(ACCESS_TOKEN_EXP_MINUTES * 60));
	setCookie(c, REFRESH_TOKEN_COOKIE_NAME, newRefreshToken, getCookieSettings(REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60));

	return c.json({ success: true, message: 'Session rotated' });
});

authRoutes.post('/logout', async (c) => {
	const db = c.get('db');
	let sessionUser: any;
	
	try {
		sessionUser = await requireJwtAuth(c, db);
	} catch (err) {
		// If auth fails on logout, just clear cookies
	}

	let body: any = {};
	try {
		body = await c.req.json();
	} catch {
		// Ignore parsing errors, assume not super_logout
	}
	
	const superLogout = !!body?.super_logout;

	if (sessionUser) {
		const expiresAt = new Date(sessionUser.exp * 1000).toISOString();
		await blacklistToken(db, sessionUser.jti, expiresAt);

		if (superLogout) {
			await revokeAllRefreshTokensForUser(db, sessionUser.id);
			await incrementUserTokenVersion(db, sessionUser.id);
		} else {
			const refreshTokenCookie = getCookie(c, REFRESH_TOKEN_COOKIE_NAME);
			if (refreshTokenCookie) {
				const allTokens = await getRefreshTokensForUser(db, sessionUser.id);
				const matchingToken = allTokens.find((t) => verifyPassword(refreshTokenCookie, t.tokenHash));
				if (matchingToken) {
					await revokeRefreshToken(db, matchingToken.id);
				}
			}
		}
	}

	deleteCookie(c, ACCESS_TOKEN_COOKIE_NAME, { path: '/' });
	deleteCookie(c, REFRESH_TOKEN_COOKIE_NAME, { path: '/' });

	return c.json({ ok: true, message: superLogout ? 'Logged out from all devices' : 'Logged out' });
});

authRoutes.get('/me', async (c) => {
	const db = c.get('db');
	const user = await requireJwtAuth(c, db);
	return c.json({ user: toPublicUser(user as any) });
});

authRoutes.post('/signup', rateLimiter({ maxTokens: 5, refillRate: 0.1, mode: 'ip' }), async (c) => {
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
	const room = validateRoom('room' in body ? body.room : undefined);

	const existing = await findUserByEmail(db, email);
	if (existing) {
		throw new HttpError(409, 'conflict', 'A user with this email address already exists.');
	}

	const id = `stu-${randomUUID().slice(0, 8)}`;
	const passwordHash = hashPassword(password);

	await createUser(db, id, name, email, passwordHash, 'student', room);

	const newUser = await findUserById(db, id);
	if (!newUser) {
		throw new HttpError(500, 'internal', 'Failed to create user account.');
	}

	return c.json({ success: true, user: toPublicUser(newUser) }, 201);
});
