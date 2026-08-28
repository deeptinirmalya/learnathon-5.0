/**
 * HTTP client for the Hono API. Implements the same service interfaces as the mock layer.
 * Swap `$lib/services/mock` imports to `$lib/services` (this module) once the API is running.
 */
import type {
	AuthService,
	CommentService,
	CreateGrievanceInput,
	GrievanceService,
	UserService
} from '$lib/services/types';
import type { AuthResult, Comment, Grievance, GrievanceStatus, Result, User } from '$lib/types';

const SESSION_KEY = 'hg.session.user';

async function readJson(res: Response): Promise<Record<string, unknown>> {
	return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function errorMessage(json: Record<string, unknown>, fallback: string): string {
	return typeof json.error === 'string' ? json.error : fallback;
}

/** A single in-flight refresh promise shared across concurrent requests. */
let refreshPromise: Promise<boolean> | null = null;

/** Set to true once a redirect to /login has been initiated, to avoid loops. */
let redirecting = false;

function redirectToLogin() {
	if (redirecting) return;
	redirecting = true;
	try {
		localStorage.removeItem(SESSION_KEY);
	} catch {
		/* ignore */
	}
	if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
		window.location.href = '/login';
	}
}

/** Reset state after a successful sign-in so the interceptor works again. */
export function resetRedirecting() {
	redirecting = false;
}

/**
 * Drop-in replacement for `fetch` that transparently handles expired access tokens.
 * On a 401 it calls POST /api/refresh once (deduplicating concurrent callers);
 * if that succeeds it retries the original request.
 * If refresh also fails the user is redirected to /login.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(input, { credentials: 'include', ...init });

	if (res.status !== 401) return res;

	// Only one refresh call in flight at a time — all concurrent 401s share it.
	if (!refreshPromise) {
		refreshPromise = fetch('/api/refresh', { method: 'POST', credentials: 'include' })
			.then((r) => r.ok)
			.catch(() => false)
			.finally(() => {
				refreshPromise = null;
			});
	}

	const refreshed = await refreshPromise;

	if (!refreshed) {
		redirectToLogin();
		// Return a synthetic 401 so callers don't try to parse a consumed body
		return new Response(JSON.stringify({ error: 'Session expired.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Retry the original request — cookies are now updated by the browser
	return fetch(input, { credentials: 'include', ...init });
}

class ApiAuthService implements AuthService {
	private currentUser: User | null = null;

	async signIn(email: string, password: string): Promise<AuthResult> {
		const res = await fetch('/api/login', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
		const json = await readJson(res);
		if (!res.ok) {
			return { ok: false, error: errorMessage(json, 'Invalid email or password.') };
		}
		const user = json.user as User;
		this.currentUser = user;
		try {
			localStorage.setItem(SESSION_KEY, JSON.stringify(user));
		} catch {
			/* ignore */
		}
		return { ok: true, user };
	}

	async signUp(name: string, email: string, password: string, room: string): Promise<AuthResult> {
		const res = await fetch('/api/signup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, email, password, room })
		});
		const json = await readJson(res);
		if (!res.ok) {
			return { ok: false, error: errorMessage(json, 'Registration failed.') };
		}
		return this.signIn(email, password);
	}

	async signOut(): Promise<void> {
		this.currentUser = null;
		try {
			localStorage.removeItem(SESSION_KEY);
		} catch {
			/* ignore */
		}
		await fetch('/api/logout', { method: 'POST', credentials: 'include' });
	}

	restore(): User | null {
		if (this.currentUser) return this.currentUser;
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (!raw) return null;
			this.currentUser = JSON.parse(raw) as User;
			return this.currentUser;
		} catch {
			return null;
		}
	}
}

class ApiUserService implements UserService {
	async getById(_id: string): Promise<User | null> {
		return null;
	}
}

async function grievanceResult(res: Response): Promise<Result<Grievance>> {
	const json = await readJson(res);
	if (!res.ok) {
		return { ok: false, error: errorMessage(json, `Request failed (${res.status}).`) };
	}
	return { ok: true, data: json.data as Grievance };
}

class ApiGrievanceService implements GrievanceService {
	async listForStudent(_studentId: string): Promise<Result<Grievance[]>> {
		return this.list();
	}

	async listAll(): Promise<Result<Grievance[]>> {
		return this.list();
	}

	private async list(): Promise<Result<Grievance[]>> {
		const res = await apiFetch('/api/grievances', { credentials: 'include' });
		const json = await readJson(res);
		if (!res.ok) {
			return { ok: false, error: errorMessage(json, 'Could not load grievances.') };
		}
		return { ok: true, data: json.data as Grievance[] };
	}

	async getById(id: string): Promise<Result<Grievance>> {
		const res = await apiFetch(`/api/grievances/${encodeURIComponent(id)}`, { credentials: 'include' });
		return grievanceResult(res);
	}

	async create(input: CreateGrievanceInput): Promise<Result<Grievance>> {
		const file = input.attachment && 'file' in input.attachment ? (input.attachment as { file?: File }).file : undefined;
		let res: Response;
		if (file) {
			const form = new FormData();
			form.set('title', input.title);
			form.set('category', input.category);
			form.set('description', input.description);
			form.set('file', file);
			res = await apiFetch('/api/grievances', { method: 'POST', credentials: 'include', body: form });
		} else {
			res = await apiFetch('/api/grievances', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: input.title,
					category: input.category,
					description: input.description
				})
			});
		}
		return grievanceResult(res);
	}

	async updateStatus(id: string, status: GrievanceStatus): Promise<Result<Grievance>> {
		const res = await apiFetch(`/api/grievances/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status })
		});
		return grievanceResult(res);
	}
}

class ApiCommentService implements CommentService {
	async add(grievanceId: string, _authorId: string, body: string): Promise<Result<Comment>> {
		const res = await apiFetch(`/api/grievances/${encodeURIComponent(grievanceId)}/comments`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ body })
		});
		const json = await readJson(res);
		if (!res.ok) {
			return { ok: false, error: errorMessage(json, 'Could not add the comment.') };
		}
		return { ok: true, data: json.data as Comment };
	}
}

export const authService: AuthService = new ApiAuthService();
export const userService: UserService = new ApiUserService();
export const grievanceService: GrievanceService = new ApiGrievanceService();
export const commentService: CommentService = new ApiCommentService();
