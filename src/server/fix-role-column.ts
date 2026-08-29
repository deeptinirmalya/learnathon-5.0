import './load-env.ts';
import { openDatabase } from './db/connection.ts';

const db = openDatabase();
try {
	await db.$executeRawUnsafe('ALTER TABLE "public"."users" ALTER COLUMN "role" TYPE text USING "role"::text');
	console.log('users.role converted to text.');
	const type = await db.$queryRawUnsafe(
		"SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'"
	);
	console.log('now:', JSON.stringify(type));
} catch (e) {
	console.error('ALTER failed:', e);
	process.exitCode = 1;
} finally {
	await db.$disconnect();
}