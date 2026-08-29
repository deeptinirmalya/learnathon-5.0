import './load-env.ts';
import { openDatabase } from './db/connection.ts';

const db = openDatabase();
try {
	const rows = await db.$queryRawUnsafe(
		"SELECT column_name, data_type, udt_name, udt_schema FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('role', 'status', 'category') ORDER BY column_name"
	);
	console.log(JSON.stringify(rows, null, 2));
	const enums = await db.$queryRawUnsafe(
		"SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname IN ('Role','GrievanceStatus','GrievanceCategory') ORDER BY 1,2"
	);
	console.log('collected enums:', JSON.stringify(enums, null, 2));
} finally {
	await db.$disconnect();
}