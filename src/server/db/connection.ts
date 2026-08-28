import { PrismaClient } from '@prisma/client';

export function openDatabase(path?: string): PrismaClient {
	return new PrismaClient();
}
