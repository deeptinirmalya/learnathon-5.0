import type { Database } from 'better-sqlite3';

export type AppEnv = {
	Variables: {
		db: Database;
		uploadsDir: string;
		user?: {
			id: string;
			name: string;
			email: string;
			role: 'student' | 'warden';
			room: string | null;
			token_version: number;
			created_at: string;
			exp?: number;
			jti?: string;
		};
	};
};
