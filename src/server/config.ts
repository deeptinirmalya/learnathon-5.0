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

export const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback_secret_for_dev_must_be_32_chars_long!';
export const ACCESS_TOKEN_COOKIE_NAME = 'hg_access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'hg_refresh_token';

// --- Redis Config ---
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

// --- Database Seeding Config ---
export const SEED_STUDENT_PASSWORD = process.env.SEED_STUDENT_PASSWORD ?? 'SecureStudentPass123!';
export const SEED_WARDEN_PASSWORD = process.env.SEED_WARDEN_PASSWORD ?? 'SecureWardenPass123!';

// --- Cloudflare R2 Config ---
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';
export const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN ?? '';


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

