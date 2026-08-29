import './load-env.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { openDatabase } from './db/connection.ts';
import { seedDatabase } from './db/seed.ts';
import {
	SEED_ADMIN_PASSWORD,
	SEED_STUDENT_PASSWORD,
	SEED_WARDEN_PASSWORD
} from './config.ts';
import { resetMemoryBuckets } from './http/rate_limit.ts';

function cookieHeader(res: Response): string {
	const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
	const list = anyHeaders.getSetCookie?.() ?? [];
	if (list.length > 0) {
		return list.map((v) => v.split(';')[0]).join('; ');
	}
	const raw = res.headers.get('set-cookie');
	return raw ? raw.split(';')[0] : '';
}

async function login(
	app: ReturnType<typeof createApp>,
	email: string,
	password: string,
	xff: string
): Promise<{ cookie: string; xff: string; csrfToken: string }> {
	const csrfRes = await app.request('/api/csrf', {
		headers: { 'X-Forwarded-For': xff, 'User-Agent': 'admin-test-agent' }
	});
	const csrfJson = await csrfRes.json();
	const csrfToken = typeof csrfJson.csrfToken === 'string' ? csrfJson.csrfToken : '';
	const csrfCookie = cookieHeader(csrfRes);

	const res = await app.request('/api/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Forwarded-For': xff,
			'User-Agent': 'admin-test-agent',
			'X-CSRF-Token': csrfToken,
			Cookie: csrfCookie
		},
		body: JSON.stringify({ email, password })
	});
	const authCookies = cookieHeader(res);
	const combinedCookie = [csrfCookie, authCookies].filter(Boolean).join('; ');
	return { cookie: combinedCookie, xff, csrfToken };
}

function headersFor(cookie: string, xff: string, csrfToken?: string): Record<string, string> {
	const headers: Record<string, string> = { Cookie: cookie, 'X-Forwarded-For': xff, 'User-Agent': 'admin-test-agent' };
	if (csrfToken) {
		headers['X-CSRF-Token'] = csrfToken;
	}
	return headers;
}

describe('Admin feature: warden management and password control', () => {
	let dir: string;
	let app: ReturnType<typeof createApp>;
	let db: ReturnType<typeof openDatabase>;
	const createdWardens: string[] = [];

	beforeEach(async () => {
		resetMemoryBuckets();
		if (!db) {
			db = openDatabase();
		}
		dir = mkdtempSync(join(tmpdir(), 'hg-admin-'));
		const uploadDir = join(dir, 'uploads');
		await seedDatabase(db, uploadDir);
		app = createApp({ db, uploadsDir: uploadDir });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	afterAll(async () => {
		// Best-effort cleanup of any warden accounts created by these tests.
		if (db) {
			for (const id of createdWardens) {
				try {
					await db.user.delete({ where: { id } });
				} catch {
					/* already removed */
				}
			}
			await db.$disconnect();
		}
	});

	it('rejects non-admin roles on admin endpoints', async () => {
		const warden = await login(app, 'warden@example.test', SEED_WARDEN_PASSWORD, '10.0.0.2');
		const deniedWarden = await app.request('/api/admin/users', {
			headers: headersFor(warden.cookie, warden.xff)
		});
		expect(deniedWarden.status).toBe(403);

		const student = await login(app, 'student@example.test', SEED_STUDENT_PASSWORD, '10.0.0.3');
		const deniedStudent = await app.request('/api/admin/users', {
			headers: headersFor(student.cookie, student.xff)
		});
		expect(deniedStudent.status).toBe(403);
	});

	it('lets the admin list users without leaking password hashes', async () => {
		const admin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.101.1');
		const res = await app.request('/api/admin/users', {
			headers: headersFor(admin.cookie, admin.xff)
		});
		expect(res.status).toBe(200);
		const json = await res.json();
		const roles = json.users.map((u: { role: string }) => u.role);
		expect(roles).toContain('admin');
		expect(roles).toContain('warden');
		expect(roles).toContain('student');
		expect(JSON.stringify(json)).not.toMatch(/passwordHash|password_hash/i);
	});

	it('lets the admin provision a warden who can then sign in', async () => {
		const admin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.102.1');
		const email = `warden-${Date.now()}@giet.edu`;
		const created = await app.request('/api/admin/wardens', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ name: 'Test Warden', email, password: 'NewWardenPass123!' })
		});
		expect(created.status).toBe(201);
		const createdJson = await created.json();
		expect(createdJson.user.role).toBe('warden');
		createdWardens.push(createdJson.user.id);

		const wardenLogin = await login(app, email, 'NewWardenPass123!', '10.0.0.4');
		expect(wardenLogin.cookie).toContain('hg_access_token=');

		// Duplicate email is rejected.
		const dup = await app.request('/api/admin/wardens', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ name: 'Duplicate Warden', email, password: 'AnotherPass123!' })
		});
		expect(dup.status).toBe(409);
	});

	it('lets the admin reset a warden password and kill old sessions', async () => {
		const admin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.103.1');
		const email = `warden-reset-${Date.now()}@giet.edu`;
		const created = await app.request('/api/admin/wardens', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ name: 'Reset Warden', email, password: 'InitialPass123!' })
		});
		const createdJson = await created.json();
		const wardenId = createdJson.user.id;
		createdWardens.push(wardenId);

		const reset = await app.request(`/api/admin/users/${wardenId}/password`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ password: 'ResetPass123!' })
		});
		expect(reset.status).toBe(200);

		const oldPw = await login(app, email, 'InitialPass123!', '10.0.0.5');
		expect(oldPw.cookie).not.toContain('hg_access_token=');

		const newPw = await login(app, email, 'ResetPass123!', '10.0.0.6');
		expect(newPw.cookie).toContain('hg_access_token=');
	});

	it('lets the admin remove a warden, after which login fails and the list no longer contains them', async () => {
		const admin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.104.1');
		const email = `warden-remove-${Date.now()}@giet.edu`;
		const created = await app.request('/api/admin/wardens', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ name: 'Doomed Warden', email, password: 'DoomedPass123!' })
		});
		const createdJson = await created.json();
		const wardenId = createdJson.user.id;
		createdWardens.push(wardenId);

		const removed = await app.request(`/api/admin/users/${wardenId}`, {
			method: 'DELETE',
			headers: headersFor(admin.cookie, admin.xff, admin.csrfToken)
		});
		expect(removed.status).toBe(200);

		const afterRemoval = await app.request('/api/admin/users', {
			headers: headersFor(admin.cookie, admin.xff)
		});
		const afterRemovalJson = await afterRemoval.json();
		expect(afterRemovalJson.users.some((u: { id: string }) => u.id === wardenId)).toBe(false);

		const ghost = await login(app, email, 'DoomedPass123!', '10.0.0.7');
		expect(ghost.cookie).not.toContain('hg_access_token=');
	});

	it('prevents the admin from deleting their own account or managing their own password via the user endpoint', async () => {
		const admin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.105.1');
		const selfDelete = await app.request('/api/admin/users/admin-1', {
			method: 'DELETE',
			headers: headersFor(admin.cookie, admin.xff, admin.csrfToken)
		});
		expect(selfDelete.status).toBe(403);

		const selfReset = await app.request('/api/admin/users/admin-1/password', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ password: 'SneakyPass123!' })
		});
		expect(selfReset.status).toBe(400);
	});

	it('lets the admin change their own password (current password required) and restores it', async () => {
		const admin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.106.1');

		const wrongCurrent = await app.request('/api/admin/password', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ currentPassword: 'not-the-password', newPassword: 'TempAdminPass123!' })
		});
		expect(wrongCurrent.status).toBe(401);

		const changed = await app.request('/api/admin/password', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...headersFor(admin.cookie, admin.xff, admin.csrfToken) },
			body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD, newPassword: 'TempAdminPass123!' })
		});
		expect(changed.status).toBe(200);

		// Old password no longer works, new one does.
		const oldLogin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.0.8');
		expect(oldLogin.cookie).not.toContain('hg_access_token=');
		const newLogin = await login(app, 'admin@example.test', 'TempAdminPass123!', '10.0.0.9');
		expect(newLogin.cookie).toContain('hg_access_token=');

		// Restore the original admin password so the lab accounts stay consistent.
		const restored = await app.request('/api/admin/password', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...headersFor(newLogin.cookie, newLogin.xff, newLogin.csrfToken) },
			body: JSON.stringify({ currentPassword: 'TempAdminPass123!', newPassword: SEED_ADMIN_PASSWORD })
		});
		expect(restored.status).toBe(200);

		const againLogin = await login(app, 'admin@example.test', SEED_ADMIN_PASSWORD, '10.0.0.10');
		expect(againLogin.cookie).toContain('hg_access_token=');
	});
});