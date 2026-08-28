import { randomBytes } from 'node:crypto';
import { validateFileMime, validateFileSize } from '../validation/validate.ts';
import { HttpError } from '../http/errors.ts';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } from '../config.ts';

const MIME_EXTENSION: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/gif': '.gif',
	'image/webp': '.webp'
};

export function ensureUploadsDir(dir: string): void {
	// No-op for R2
}

export function resetUploadsDir(dir: string): void {
	// No-op for R2
}

const s3Client = new S3Client({
	region: 'auto',
	endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY
	}
});

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

export async function uploadToR2(storedName: string, bytes: Buffer, mime: string): Promise<void> {
	const command = new PutObjectCommand({
		Bucket: R2_BUCKET_NAME,
		Key: storedName,
		Body: bytes,
		ContentType: mime
	});

	try {
		await s3Client.send(command);
	} catch (err) {
		console.error('Error uploading to R2:', err);
		throw new HttpError(500, 'internal', 'Failed to upload attachment to storage.');
	}
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

