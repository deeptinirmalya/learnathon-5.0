import './load-env.ts';
import { openDatabase } from './db/connection.ts';

const db = openDatabase();
try {
	await db.$executeRawUnsafe('DEALLOCATE ALL');
	console.log('plans deallocated');
} catch (e) {
	console.error('deallocate error:', String(e).slice(0, 300));
} finally {
	await db.$disconnect();
}