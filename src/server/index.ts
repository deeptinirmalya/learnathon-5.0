import './load-env.ts';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { API_PORT, DEFAULT_UPLOADS_DIR, assertSecretsConfigured } from './config.ts';
import { openDatabase } from './db/connection.ts';
import { userCount } from './db/queries.ts';
import { seedDatabase } from './db/seed.ts';
import { ensureUploadsDir } from './storage/attachments.ts';

const uploadsDir = DEFAULT_UPLOADS_DIR;
ensureUploadsDir(uploadsDir);
assertSecretsConfigured();
const db = openDatabase();

async function init() {
	if (await userCount(db) === 0) {
		await seedDatabase(db, uploadsDir);
		console.log(`Seeded Neon database with dummy data`);
	}

	const app = createApp({ db, uploadsDir });

	serve({ fetch: app.fetch, port: API_PORT }, (info) => {
		console.log(`HostelGrievance API listening on http://127.0.0.1:${info.port}`);
	});
}

init().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
