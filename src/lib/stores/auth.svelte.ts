/**
 * Session state — Svelte 5 runes module.
 * Single source of truth for "who is logged in" across the UI.
 * The future Hono API replaces the backing service, not this module's API.
 */
import { authService, apiFetch, resetRedirecting } from '$lib/services/api';
import type { User } from '$lib/types';

const initialUser = authService.restore();
let current = $state<User | null>(initialUser);

// Background verification: verify the cached session against the server.
// apiFetch will transparently attempt a token refresh on 401 before giving up.
if (typeof window !== 'undefined' && initialUser) {
	apiFetch('/api/me')
		.then((res) => {
			if (!res.ok) {
				// apiFetch already cleared localStorage + redirected on refresh failure.
				current = null;
				return;
			}
			return res.json();
		})
		.then((data) => {
			if (data && data.user) {
				// Server-side user details (including role) overrides localStorage cache
				current = data.user as User;
				localStorage.setItem('hg.session.user', JSON.stringify(data.user));
			}
		})
		.catch(() => {
			// Fail-safe: if network is down, keep using local session temporarily
		});
}

export function getSession(): User | null {
	return current;
}

export function isStudent(): boolean {
	return current?.role === 'student';
}

export function isWarden(): boolean {
	return current?.role === 'warden';
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
	const result = await authService.signIn(email, password);
	if (result.ok) {
		current = result.user;
		resetRedirecting();
		return { ok: true };
	}
	return { ok: false, error: result.error };
}

export async function signUp(
	name: string,
	email: string,
	password: string,
	room: string
): Promise<{ ok: boolean; error?: string }> {
	const result = await authService.signUp(name, email, password, room);
	if (result.ok) {
		current = result.user;
		return { ok: true };
	}
	return { ok: false, error: result.error };
}

export async function signOut(): Promise<void> {
	await authService.signOut();
	current = null;
}
