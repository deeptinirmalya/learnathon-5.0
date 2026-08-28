import { fileURLToPath } from 'node:url';
import { DEFAULT_UPLOADS_DIR } from '../config.ts';
import { openDatabase } from './connection.ts';
import { seedDatabase } from './seed.ts';
import { resetUploadsDir } from '../storage/attachments.ts';

export async function resetDatabase(uploadsDir = DEFAULT_UPLOADS_DIR): Promise<void> {
	resetUploadsDir(uploadsDir);
	const db = openDatabase();

	await db.attachment.deleteMany();
	await db.comment.deleteMany();
	await db.grievance.deleteMany();
	await db.loginHistory.deleteMany();
	await db.refreshToken.deleteMany();
	await db.tokenBlacklist.deleteMany();
	await db.user.deleteMany();

	await seedDatabase(db, uploadsDir);
	await db.$disconnect();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	resetDatabase().then(() => {
		console.log('Reset complete: Neon database and uploads/ restored to the seeded lab state.');
	}).catch((err) => {
		console.error('Reset failed:', err);
		process.exit(1);
	});
}
