import { apiFetch } from '$lib/services/api';
import type { PublicUser } from '../../../src/server/types/index.ts';

async function parseRes(res: Response) {
	const json = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(json.error || `Request failed (${res.status})`);
	}
	return json;
}

export async function listUsers(): Promise<{ users: PublicUser[] }> {
	const res = await apiFetch('/api/admin/users');
	return parseRes(res);
}

export async function createWarden(data: Record<string, unknown>): Promise<{ success: boolean; user: PublicUser }> {
	const res = await apiFetch('/api/admin/wardens', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return parseRes(res);
}

export async function updateUserPassword(id: string, password: string): Promise<{ success: boolean; message: string }> {
	const res = await apiFetch(`/api/admin/users/${id}/password`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ password })
	});
	return parseRes(res);
}

export async function deleteUser(id: string): Promise<{ success: boolean; message: string }> {
	const res = await apiFetch(`/api/admin/users/${id}`, {
		method: 'DELETE'
	});
	return parseRes(res);
}
