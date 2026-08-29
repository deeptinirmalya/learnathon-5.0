import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/passwords.ts';
import {
	SEED_STUDENT_PASSWORD,
	SEED_WARDEN_PASSWORD,
	SEED_ADMIN_PASSWORD,
	assertSecretsConfigured
} from '../config.ts';

export async function seedDatabase(db: PrismaClient, uploadsDir: string): Promise<void> {
	assertSecretsConfigured();
	const studentHash = hashPassword(SEED_STUDENT_PASSWORD);
	const wardenHash = hashPassword(SEED_WARDEN_PASSWORD);
	const adminHash = hashPassword(SEED_ADMIN_PASSWORD);

	const users = [
		{ id: 'stu-1', name: 'Aarav Mehta', email: 'student@example.test', passwordHash: studentHash, role: 'student', room: 'B-204', createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'stu-2', name: 'Priya Nair', email: 'priya@example.test', passwordHash: studentHash, role: 'student', room: 'A-112', createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'stu-3', name: 'Rohan Das', email: 'rohan@example.test', passwordHash: studentHash, role: 'student', room: 'C-008', createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'war-1', name: 'Mr. K. Sahu', email: 'warden@example.test', passwordHash: wardenHash, role: 'warden', room: null, createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'admin-1', name: 'System Admin', email: 'admin@example.test', passwordHash: adminHash, role: 'admin', room: null, createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'admin-2', name: 'System Admin (GIET)', email: 'admin@giet.edu', passwordHash: adminHash, role: 'admin', room: null, createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'war-2', name: 'Mr. K. Sahu (GIET)', email: 'warden@giet.edu', passwordHash: wardenHash, role: 'warden', room: null, createdAt: '2026-08-01T08:00:00.000Z' }
	];

	const grievances = [
		{ id: 'GRV-0001', studentId: 'stu-1', title: 'Leaking bathroom tap in B-204', category: 'Water', description: 'The tap in the attached bathroom has been dripping continuously since Monday.', status: 'open', createdAt: '2026-08-13T09:00:00.000Z', updatedAt: '2026-08-13T09:00:00.000Z' },
		{ id: 'GRV-0002', studentId: 'stu-1', title: 'Corridor light fixture flickering', category: 'Electricity', description: 'The tube light right outside room B-204 blinks constantly at night.', status: 'in_progress', createdAt: '2026-08-14T18:00:00.000Z', updatedAt: '2026-08-14T18:00:00.000Z' },
		{ id: 'GRV-0003', studentId: 'stu-2', title: 'Wi-Fi keeps disconnecting in Block A', category: 'Internet', description: 'Signal strength is fine but DNS resolution drops every few minutes.', status: 'open', createdAt: '2026-08-15T20:00:00.000Z', updatedAt: '2026-08-15T20:00:00.000Z' },
		{ id: 'GRV-0004', studentId: 'stu-3', title: 'Common washroom cleanliness issue', category: 'Cleanliness', description: 'Third floor common washroom has not been cleaned since Saturday morning.', status: 'resolved', createdAt: '2026-08-16T07:30:00.000Z', updatedAt: '2026-08-17T06:00:00.000Z' },
		{ id: 'GRV-0005', studentId: 'stu-2', title: 'Study table chair leg broken', category: 'Room', description: 'One leg of the wooden chair is split and unsafe to sit on.', status: 'in_progress', createdAt: '2026-08-17T11:00:00.000Z', updatedAt: '2026-08-17T11:00:00.000Z' },
		{ id: 'GRV-0006', studentId: 'stu-3', title: 'Loud noise from DG set after midnight', category: 'Other', description: 'The backup generator behind Block C runs excessively loud late at night.', status: 'open', createdAt: '2026-08-18T01:00:00.000Z', updatedAt: '2026-08-18T01:00:00.000Z' },
		{ id: 'GRV-0007', studentId: 'stu-1', title: 'Drinking water cooler not cooling', category: 'Water', description: 'Second floor water cooler is dispensing warm water.', status: 'resolved', createdAt: '2026-08-12T10:00:00.000Z', updatedAt: '2026-08-16T03:30:00.000Z' },
		{ id: 'GRV-0008', studentId: 'stu-1', title: 'Mess food table cleanliness', category: 'Cleanliness', description: 'Dining tables in the mess area are frequently left un-wiped after lunch.', status: 'open', createdAt: '2026-08-19T13:00:00.000Z', updatedAt: '2026-08-19T13:00:00.000Z' }
	];

	const comments = [
		{ id: 'cmt-1', grievanceId: 'GRV-0001', authorId: 'stu-1', body: 'Plumber was supposed to come yesterday but nobody showed up.', createdAt: '2026-08-13T14:30:00.000Z' },
		{ id: 'cmt-2', grievanceId: 'GRV-0001', authorId: 'war-1', body: 'Plumbing contractor has been re-notified. Work order #1042.', createdAt: '2026-08-14T02:00:00.000Z' },
		{ id: 'cmt-3', grievanceId: 'GRV-0002', authorId: 'war-1', body: 'Electrician scheduled for today between 4–6 PM.', createdAt: '2026-08-15T03:30:00.000Z' },
		{ id: 'cmt-4', grievanceId: 'GRV-0002', authorId: 'stu-1', body: 'Electrician arrived and replaced the starter, testing now.', createdAt: '2026-08-15T11:00:00.000Z' },
		{ id: 'cmt-5', grievanceId: 'GRV-0003', authorId: 'war-1', body: 'ISP has been notified about the outage in Block A. Escalation reference: #48211.', createdAt: '2026-08-16T04:20:00.000Z' },
		{ id: 'cmt-6', grievanceId: 'GRV-0003', authorId: 'stu-2', body: 'It came back for an hour yesterday evening and dropped again.', createdAt: '2026-08-16T08:40:00.000Z' },
		{ id: 'cmt-7', grievanceId: 'GRV-0004', authorId: 'war-1', body: 'Cleaning schedule for the third floor has been revised. Marking this resolved — please reopen if it regresses.', createdAt: '2026-08-17T06:00:00.000Z' },
		{ id: 'cmt-8', grievanceId: 'GRV-0006', authorId: 'stu-3', body: 'Requesting an update when possible — the noise makes it hard to sleep.', createdAt: '2026-08-18T15:10:00.000Z' },
		{ id: 'cmt-9', grievanceId: 'GRV-0006', authorId: 'war-1', body: 'Generator maintenance is booked for Friday. Apologies for the disturbance.', createdAt: '2026-08-18T16:02:00.000Z' },
		{ id: 'cmt-10', grievanceId: 'GRV-0007', authorId: 'war-1', body: 'Water tank was cleaned and refilled on Sunday. Confirming supply is normal.', createdAt: '2026-08-16T03:30:00.000Z' }
	];

	const attachments = [
		{ id: 'att-1', grievanceId: 'GRV-0001', originalFilename: 'leaking-tap.jpg', mimeType: 'image/jpeg', url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: '2026-08-13T09:15:00.000Z' },
		{ id: 'att-2', grievanceId: 'GRV-0002', originalFilename: 'corridor-light-off.png', mimeType: 'image/png', url: 'https://res.cloudinary.com/demo/image/upload/sample.png', createdAt: '2026-08-14T18:30:00.000Z' },
		{ id: 'att-3', grievanceId: 'GRV-0003', originalFilename: 'wifi-speedtest.png', mimeType: 'image/png', url: 'https://res.cloudinary.com/demo/image/upload/sample.png', createdAt: '2026-08-15T20:10:00.000Z' },
		{ id: 'att-4', grievanceId: 'GRV-0008', originalFilename: 'mess-area.jpg', mimeType: 'image/jpeg', url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: '2026-08-19T13:05:00.000Z' }
	];

	await db.$transaction(
		async (tx) => {
			for (const user of users) {
				await tx.user.upsert({
					where: { email: user.email },
					update: { name: user.name, passwordHash: user.passwordHash, role: user.role, room: user.room },
					create: user
				});
			}
			await tx.grievance.createMany({ data: grievances, skipDuplicates: true });
			await tx.comment.createMany({ data: comments, skipDuplicates: true });
			await tx.attachment.createMany({ data: attachments, skipDuplicates: true });
		},
		{ maxWait: 15000, timeout: 30000 }
	);
}
