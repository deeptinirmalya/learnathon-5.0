import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(SERVER_DIR, '../..');

export const DEFAULT_DB_PATH =
	process.env.HOSTEL_DB_PATH ?? path.join(REPO_ROOT, 'data', 'hostel.db');

export const DEFAULT_UPLOADS_DIR =
	process.env.HOSTEL_UPLOADS_DIR ?? path.join(REPO_ROOT, 'uploads');

export const API_PORT = Number(process.env.HOSTEL_API_PORT ?? 3001);

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp'
]);

// --- JWT & Auth Config ---

export const JWT_SECRET = process.env.JWT_SECRET ?? '';
export const ACCESS_TOKEN_COOKIE_NAME = 'hg_access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'hg_refresh_token';
export const CSRF_TOKEN_COOKIE_NAME = 'hg_csrf_token';

// --- Redis Config ---
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

// --- Database Seeding Config ---
export const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';

// --- Cloudinary Config ---
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? '';
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? '';

export function assertSecretsConfigured(): void {
	if (!JWT_SECRET) {
		throw new Error('JWT_SECRET is not set. Provide it via the environment (.env file).');
	}
	if (!SEED_ADMIN_PASSWORD) {
		throw new Error(
			'Seed passwords are not set. Provide SEED_ADMIN_PASSWORD via the environment (.env file).'
		);
	}
}


const IS_DEV = process.env.NODE_ENV !== 'production';

export function getCookieSettings(maxAge: number) {
	return {
		httpOnly: true,
		secure: !IS_DEV, // Secure only in production (HTTPS)
		sameSite: 'Lax' as const, // Lax is usually better for local dev than Strict, depending on setup
		path: '/',
		maxAge
	};
}

