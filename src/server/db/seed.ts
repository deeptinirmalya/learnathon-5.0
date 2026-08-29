import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/passwords.ts';
import {
	SEED_ADMIN_PASSWORD,
	assertSecretsConfigured
} from '../config.ts';
import { randomUUID } from 'node:crypto';

export async function seedDatabase(db: PrismaClient, uploadsDir: string): Promise<void> {
	assertSecretsConfigured();
	const adminHash = hashPassword(SEED_ADMIN_PASSWORD);

	const users = [
		{ id: 'admin-1', name: 'System Admin', email: 'admin@giet.edu', passwordHash: adminHash, role: 'admin', room: null, createdAt: '2026-08-01T08:00:00.000Z' }
	];

	await db.$transaction(async (tx) => {
		// Upsert seed accounts so login credentials always match the env-configured
		// SEED_*_PASSWORD values
		for (const user of users) {
			await tx.user.upsert({
				where: { email: user.email },
				update: { name: user.name, passwordHash: user.passwordHash, role: user.role, room: user.room },
				create: user
			});
		}
	});
}
