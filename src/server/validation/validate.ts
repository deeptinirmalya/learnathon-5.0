/**
 * Central input validation module.
 * Every public-facing input passes through here before hitting the DB.
 * All validators throw HttpError(400) on failure so callers need no extra try/catch.
 */
import { HttpError } from '../http/errors.ts';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Strip null bytes and dangerous ASCII control characters.
 * Keeps printable chars plus \t (0x09), \n (0x0A), \r (0x0D).
 */
function sanitizeControls(value: string): string {
	return value.replace(/[\0\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ─── Generic bounded string ───────────────────────────────────────────────────

/**
 * Validate that `value` is a string within [min, max] length (after trimming
 * and stripping control characters).
 */
export function validateString(field: string, value: unknown, min: number, max: number): string {
	if (typeof value !== 'string') {
		throw new HttpError(400, 'bad_request', `${field} must be a string.`);
	}
	const cleaned = sanitizeControls(value).trim();
	if (cleaned.length < min) {
		throw new HttpError(
			400,
			'bad_request',
			`${field} must be at least ${min} character${min === 1 ? '' : 's'}.`
		);
	}
	if (cleaned.length > max) {
		throw new HttpError(400, 'bad_request', `${field} must be ${max} characters or fewer.`);
	}
	return cleaned;
}

// ─── Email ────────────────────────────────────────────────────────────────────

/** Basic RFC-5321 shape: local@domain.tld — no whitespace, max 254 chars. */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/;

export function validateEmail(value: unknown): string {
	const s = validateString('Email', value, 3, 254);
	if (!EMAIL_RE.test(s)) {
		throw new HttpError(400, 'bad_request', 'Email address is not valid.');
	}
	return s.toLowerCase();
}

// ─── Password ─────────────────────────────────────────────────────────────────

/** Passwords are NOT trimmed — leading/trailing spaces are intentional. */
export function validatePassword(value: unknown): string {
	if (typeof value !== 'string') {
		throw new HttpError(400, 'bad_request', 'Password must be a string.');
	}
	if (value.length < 6) {
		throw new HttpError(400, 'bad_request', 'Password must be at least 6 characters.');
	}
	if (value.length > 128) {
		throw new HttpError(400, 'bad_request', 'Password must be 128 characters or fewer.');
	}
	return value;
}

// ─── Grievance text fields ────────────────────────────────────────────────────

export function validateTitle(value: unknown): string {
	return validateString('Title', value, 5, 120);
}

export function validateDescription(value: unknown): string {
	return validateString('Description', value, 20, 3000);
}

export function validateCommentBody(value: unknown): string {
	return validateString('Comment body', value, 1, 2000);
}

// ─── URL / ID params ──────────────────────────────────────────────────────────

/** Grievance IDs look like GRV-0001, GRV-0042, etc. */
const GRIEVANCE_ID_RE = /^GRV-\d{4,}$/;

export function validateGrievanceId(value: string | undefined): string {
	if (!value || !GRIEVANCE_ID_RE.test(value)) {
		throw new HttpError(400, 'bad_request', 'Invalid grievance ID format.');
	}
	return value;
}

/** Generic alphanumeric-and-hyphen/underscore ID (covers att-N, cmt-N, etc.) */
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateResourceId(value: string | undefined): string {
	if (!value || !SAFE_ID_RE.test(value)) {
		throw new HttpError(400, 'bad_request', 'Invalid resource ID format.');
	}
	return value;
}

// ─── File magic-byte MIME detection ──────────────────────────────────────────
// We do NOT trust the Content-Type header or file extension sent by the client.
// Instead we inspect the first bytes of the actual file content.

function matchBytes(buf: Buffer, offset: number, ...expected: number[]): boolean {
	for (let i = 0; i < expected.length; i++) {
		if (buf[offset + i] !== expected[i]) return false;
	}
	return true;
}

export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Detect the real MIME type from the first bytes of a file buffer.
 * Returns null if the file doesn't match any allowed image format.
 */
export function detectMimeFromBytes(bytes: Buffer): AllowedMime | null {
	if (bytes.length < 12) return null;

	// JPEG: starts with FF D8 FF
	if (matchBytes(bytes, 0, 0xff, 0xd8, 0xff)) return 'image/jpeg';

	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (matchBytes(bytes, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';

	// GIF: GIF87a or GIF89a → first 4 bytes are "GIF8"
	if (matchBytes(bytes, 0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';

	// WebP: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
	if (matchBytes(bytes, 0, 0x52, 0x49, 0x46, 0x46) && matchBytes(bytes, 8, 0x57, 0x45, 0x42, 0x50))
		return 'image/webp';

	return null;
}

/**
 * Validate that `bytes` is a real allowed image by inspecting its magic bytes.
 * Returns the detected MIME type so callers can store the correct value.
 * Throws HttpError(400) if the file is not a permitted image format.
 */
export function validateFileMime(bytes: Buffer): AllowedMime {
	const detected = detectMimeFromBytes(bytes);
	if (!detected) {
		throw new HttpError(
			400,
			'bad_request',
			'Attachments must be a valid JPEG, PNG, GIF, or WebP image.'
		);
	}
	return detected;
}

/** Max allowed upload size (2 MB). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function validateFileSize(size: number): void {
	if (size <= 0) {
		throw new HttpError(400, 'bad_request', 'Attachment file is empty.');
	}
	if (size > MAX_FILE_BYTES) {
		throw new HttpError(400, 'bad_request', 'Attachment must be 2 MB or smaller.');
	}
}

export function validateName(value: unknown): string {
	return validateString('Name', value, 2, 80);
}

export function validateRoom(value: unknown): string | null {
	if (value === undefined || value === null || value === '') return null;
	return validateString('Room', value, 2, 20);
}
