import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { validateFileMime, validateFileSize } from '../validation/validate.ts';
import { HttpError } from '../http/errors.ts';

const MIME_EXTENSION: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/gif': '.gif',
	'image/webp': '.webp'
};

export function ensureUploadsDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

export function resetUploadsDir(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
	mkdirSync(dir, { recursive: true });
}

/** Sanitise the user-supplied filename for display only (never used as stored path). */
export function originalBasename(filename: string): string {
	const base = filename.replace(/\\/g, '/').split('/').pop() ?? 'upload';
	const cleaned = base.replace(/[\0\r\n]/g, '').trim();
	return cleaned.length > 0 ? cleaned.slice(0, 255) : 'upload';
}

/**
 * Always generate a cryptographically random stored filename.
 * The user-supplied name is stored separately in the DB for display only.
 */
export function newStoredName(mime: string): string {
	const ext = MIME_EXTENSION[mime] ?? '.bin';
	return `${randomBytes(16).toString('hex')}${ext}`;
}

export function writeStoredFile(uploadsDir: string, storedName: string, bytes: Buffer): void {
	ensureUploadsDir(uploadsDir);
	writeFileSync(join(uploadsDir, storedName), bytes);
}

export function readStoredFile(uploadsDir: string, storedName: string): Buffer {
	if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	const root = resolve(uploadsDir);
	const full = resolve(join(uploadsDir, storedName));
	if (full !== root && !full.startsWith(root + sep)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	if (!existsSync(full)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	return readFileSync(full);
}

export function listStoredNames(uploadsDir: string): string[] {
	if (!existsSync(uploadsDir)) return [];
	return readdirSync(uploadsDir).filter((name) => name !== '.gitkeep');
}

/**
 * Read the upload into a Buffer, validate file size, then verify the real
 * MIME type using magic bytes (not the client-supplied Content-Type).
 * Returns both the buffer and the detected MIME so callers store the correct value.
 */
export async function bufferFromUpload(file: File): Promise<{ bytes: Buffer; mime: string }> {
	const bytes = Buffer.from(await file.arrayBuffer());
	validateFileSize(bytes.byteLength);
	const mime = validateFileMime(bytes); // throws 400 if not a valid image
	return { bytes, mime };
}

