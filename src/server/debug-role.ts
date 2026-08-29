import './load-env.ts';
import { openDatabase } from './db/connection.ts';
import { hashPassword } from './auth/passwords.ts';

const db = openDatabase();
try {
	const probe = await db.user.create({
		data: {
			id: `probe-${Date.now()}`,
			name: 'Probe',
			email: `probe-${Date.now()}@example.test`,
			passwordHash: hashPassword('ProbePass123!'),
			role: 'warden',
			room: null,
			createdAt: new Date().toISOString()
		}
	});
	console.log('created ok:', probe.id, probe.role);
	await db.user.delete({ where: { id: probe.id } });
	console.log('deleted ok');
} catch (e) {
	console.error('probe failed:', e);
} finally {
	await db.$disconnect();
}