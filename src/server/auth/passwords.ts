import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;

export function hashPassword(password: string): string {
	// unique 16-byte salt for every password
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(password, salt, KEY_LEN).toString('hex');

	return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split(':');
	if (parts.length !== 3) return false;

	const [scheme, salt, hash] = parts;
	if (scheme !== 'scrypt' || !salt || !hash) return false;

	const actual = scryptSync(password, salt, KEY_LEN);
	const expected = Buffer.from(hash, 'hex');

	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}