import type { PrismaClient } from '@prisma/client';

export type AppEnv = {
	Variables: {
		db: PrismaClient;
		uploadsDir: string;
		user?: {
			id: string;
			name: string;
			email: string;
			role: 'student' | 'warden' | 'admin';
			room: string | null;
			token_version: number;
			created_at: string;
			exp?: number;
			jti?: string;
		};
	};
};
