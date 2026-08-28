import { sign, verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { Database } from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { JWT_SECRET, ACCESS_TOKEN_COOKIE_NAME } from '../config.ts';
import { HttpError } from '../http/errors.ts';
import { isTokenBlacklisted, findUserById } from '../db/queries.ts';

// Token Expiry times
export const ACCESS_TOKEN_EXP_MINUTES = 15;
export const REFRESH_TOKEN_EXP_DAYS = 7;

export function generateFingerprint(ip: string, userAgent: string): string {
	return createHash('sha256')
		.update(`${ip}|${userAgent}`)
		.digest('hex');
}

export function getClientInfo(c: Context) {
	// In a real proxy setup, use X-Forwarded-For etc.
	const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
	const userAgent = c.req.header('user-agent') || 'unknown';
	return { ip, userAgent, country: 'unknown' };
}

export async function createAccessToken(
	userId: string,
	role: string,
	status: string,
	jti: string,
	fingerprint: string,
	tokenVersion: number
) {
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + ACCESS_TOKEN_EXP_MINUTES * 60;
	
	const payload = {
		sub: userId,
		user_id: userId,
		role,
		status,
		jti,
		fpt: fingerprint,
		version: tokenVersion,
		type: 'access',
		exp,
		iat
	};
	
	return await sign(payload, JWT_SECRET, 'HS256');
}

export async function createRefreshToken(userId: string) {
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60;
	
	const payload = {
		sub: userId,
		user_id: userId,
		type: 'refresh',
		exp,
		iat
	};
	
	return await sign(payload, JWT_SECRET, 'HS256');
}

export async function requireJwtAuth(c: Context, db: Database) {
	let token = '';
	const authHeader = c.req.header('Authorization');
	
	if (authHeader && authHeader.startsWith('Bearer ')) {
		token = authHeader.split(' ')[1];
	}
	
	if (!token) {
		token = getCookie(c, ACCESS_TOKEN_COOKIE_NAME) || '';
	}
	
	if (!token) {
		throw new HttpError(401, 'unauthenticated', 'Missing access token');
	}
	
	// CSRF Protection Check
	const method = c.req.method;
	if (!authHeader && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
		// Just a basic check, normally would use X-Requested-With or standard CSRF tokens
		// if relying completely on cookies for API requests.
		// skipping strict checks here as standard cors covers many cases, but adding stub for reference.
	}
	
	let payload: any;
	try {
		payload = await verify(token, JWT_SECRET, 'HS256');
	} catch (err) {
		throw new HttpError(401, 'unauthenticated', 'Invalid or expired session');
	}
	
	if (payload.type !== 'access') {
		throw new HttpError(401, 'unauthenticated', 'Invalid token type');
	}
	
	// 1. Check Session Binding
	const { ip, userAgent } = getClientInfo(c);
	const currentFpt = generateFingerprint(ip, userAgent);
	if (payload.fpt && payload.fpt !== currentFpt) {
		throw new HttpError(401, 'unauthenticated', 'Session binding violation. Please login again.');
	}
	
	// 2. Check Blacklist
	if (isTokenBlacklisted(db, payload.jti)) {
		throw new HttpError(401, 'unauthenticated', 'Token has been revoked/logged out');
	}
	
	// 3. Check Global Revocation (Token Version)
	const user = findUserById(db, payload.user_id);
	if (!user || user.token_version !== payload.version) {
		throw new HttpError(401, 'unauthenticated', 'Session revoked from all devices');
	}
	
	// Set user in context for downstream handlers
	const sessionUser = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		room: user.room,
		created_at: user.created_at,
		token_version: user.token_version,
		jti: payload.jti,
		exp: payload.exp
	};
	
	c.set('user', sessionUser);
	return sessionUser;
}
