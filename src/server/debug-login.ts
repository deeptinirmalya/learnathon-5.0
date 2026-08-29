import './load-env.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { openDatabase } from './db/connection.ts';
import { seedDatabase } from './db/seed.ts';
import { SEED_ADMIN_PASSWORD } from './config.ts';
import { findUserById, findUserByEmail } from './db/queries.ts';

const dir = mkdtempSync(join(tmpdir(), 'hg-dbg-'));
const db = openDatabase(join(dir, 'hostel.db'));
const uploadDir = join(dir, 'uploads');
await seedDatabase(db, uploadDir);

const admin = await findUserByEmail(db, 'admin@example.test');
console.log('admin row:', admin ? { id: admin.id, email: admin.email, role: admin.role } : null);
const t = performance.now();
const h = await findUserById(db, 'admin-1');
console.log('admin-1:', h ? { email: h.email, role: h.role } : null);

const app = createApp({ db, uploadsDir: uploadDir });
const res = await app.request('/api/login', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.9.9', 'User-Agent': 'dbg-agent' },
	body: JSON.stringify({ email: 'admin@example.test', password: SEED_ADMIN_PASSWORD })
});
const body = await res.clone().json().catch(() => null);
console.log('login status:', res.status, 'body keys:', body ? Object.keys(body) : []);
const hd = res.headers as Headers & { getSetCookie?: () => string[] };
const cookies = hd.getSetCookie ? hd.getSetCookie() : [];
console.log('cookie count:', cookies.length);

rmSync(dir, { recursive: true, force: true });
await db.$disconnect();