import { randomBytes } from 'node:crypto';
import { validateFileMime, validateFileSize } from '../validation/validate.ts';
import { HttpError } from '../http/errors.ts';
import { v2 as cloudinary } from 'cloudinary';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } from '../config.ts';

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

cloudinary.config({
	cloud_name: CLOUDINARY_CLOUD_NAME,
	api_key: CLOUDINARY_API_KEY,
	api_secret: CLOUDINARY_API_SECRET
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

export async function uploadToCloudinary(storedName: string, bytes: Buffer, mime: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				public_id: storedName.split('.')[0], // usually best to exclude extension for Cloudinary public_id
				resource_type: 'auto'
			},
			(error, result) => {
				if (error || !result) {
					console.error('Error uploading to Cloudinary:', error);
					reject(new HttpError(500, 'internal', 'Failed to upload attachment to storage.'));
				} else {
					resolve(result.secure_url);
				}
			}
		);
		uploadStream.end(bytes);
	});
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

