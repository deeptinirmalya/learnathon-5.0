import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/passwords.ts';
import { SEED_STUDENT_PASSWORD, SEED_WARDEN_PASSWORD } from '../config.ts';
import { randomUUID } from 'node:crypto';

export async function seedDatabase(db: PrismaClient, uploadsDir: string): Promise<void> {
	const studentHash = hashPassword(SEED_STUDENT_PASSWORD);
	const wardenHash = hashPassword(SEED_WARDEN_PASSWORD);

	const users = [
		{ id: 'stu-1', name: 'Aarav Mehta', email: 'student@example.test', passwordHash: studentHash, role: 'student', room: 'B-204', createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'stu-2', name: 'Priya Nair', email: 'priya@example.test', passwordHash: studentHash, role: 'student', room: 'A-112', createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'stu-3', name: 'Rohan Das', email: 'rohan@example.test', passwordHash: studentHash, role: 'student', room: 'C-008', createdAt: '2026-08-01T08:00:00.000Z' },
		{ id: 'war-1', name: 'Mr. K. Sahu', email: 'warden@example.test', passwordHash: wardenHash, role: 'warden', room: null, createdAt: '2026-08-01T08:00:00.000Z' }
	];

	const grievances = [
		{ id: 'GRV-0001', studentId: 'stu-1', title: 'Water leaking from bathroom ceiling', category: 'Water', description: 'Since Monday there has been a steady leak from the ceiling of the attached bathroom in B-204. Water pools on the floor and has started dripping near the electrical switch board, which feels unsafe.', status: 'in_progress', createdAt: '2026-08-13T09:15:00.000Z', updatedAt: '2026-08-14T10:12:00.000Z' },
		{ id: 'GRV-0002', studentId: 'stu-1', title: 'Corridor tube lights not working', category: 'Electricity', description: 'Both tube lights in the second floor corridor of Block B have been non-functional for four days. The corridor is completely dark after 7pm.', status: 'in_progress', createdAt: '2026-08-14T18:30:00.000Z', updatedAt: '2026-08-15T07:45:00.000Z' },
		{ id: 'GRV-0003', studentId: 'stu-2', title: 'Hostel Wi-Fi drops every few hours', category: 'Internet', description: 'The Wi-Fi in Block A disconnects repeatedly, especially between 8pm and midnight. Speed tests show under 1 Mbps when connected. Attached a screenshot from yesterday.', status: 'open', createdAt: '2026-08-15T20:10:00.000Z', updatedAt: '2026-08-16T08:40:00.000Z' },
		{ id: 'GRV-0004', studentId: 'stu-3', title: 'Third floor common area not cleaned', category: 'Cleanliness', description: 'The common room and corridor on the third floor of Block C have not been swept for over a week. Dust bins are overflowing in the morning.', status: 'resolved', createdAt: '2026-08-12T07:00:00.000Z', updatedAt: '2026-08-17T06:00:00.000Z' },
		{ id: 'GRV-0005', studentId: 'stu-2', title: 'Window latch broken in A-112', category: 'Room', description: 'The window latch in room A-112 is broken and the window cannot be secured. Rain water entered during last week’s storm and damaged books kept near the sill.', status: 'open', createdAt: '2026-08-18T11:25:00.000Z', updatedAt: '2026-08-18T11:25:00.000Z' },
		{ id: 'GRV-0006', studentId: 'stu-3', title: 'Generator noise near C block at night', category: 'Maintenance', description: 'The backup generator behind C block runs for long stretches at night and the noise makes it difficult to sleep in the rooms facing the rear. Requesting it be serviced or sound-proofed.', status: 'in_progress', createdAt: '2026-08-17T21:45:00.000Z', updatedAt: '2026-08-18T16:02:00.000Z' },
		{ id: 'GRV-0007', studentId: 'stu-3', title: 'Low water pressure on mornings', category: 'Water', description: 'Water pressure on taps in C block drops sharply between 6am and 8am. Buckets take very long to fill. It normalises after 9am.', status: 'resolved', createdAt: '2026-08-11T06:50:00.000Z', updatedAt: '2026-08-16T03:30:00.000Z' },
		{ id: 'GRV-0008', studentId: 'stu-1', title: 'Mess tables not wiped before dinner', category: 'Other', description: 'For the past few days the dining tables in the mess are not wiped before dinner service. Requesting the housekeeping staff to follow the standard routine.', status: 'open', createdAt: '2026-08-19T13:05:00.000Z', updatedAt: '2026-08-19T13:05:00.000Z' }
	];

	const comments = [
		{ id: 'cmt-1', grievanceId: 'GRV-0001', authorId: 'war-1', body: 'Logged this with the plumbing team. They will visit on Tuesday between 10am and noon.', createdAt: '2026-08-14T05:30:00.000Z' },
		{ id: 'cmt-2', grievanceId: 'GRV-0001', authorId: 'stu-1', body: 'Thank you. The leak has gotten slightly worse, water is reaching the wardrobe now.', createdAt: '2026-08-14T09:05:00.000Z' },
		{ id: 'cmt-3', grievanceId: 'GRV-0001', authorId: 'war-1', body: 'Noted — I have flagged it as priority for the visit.', createdAt: '2026-08-14T10:12:00.000Z' },
		{ id: 'cmt-4', grievanceId: 'GRV-0002', authorId: 'war-1', body: 'Electrician inspected the fitting; replacement tube lights have been ordered.', createdAt: '2026-08-15T07:45:00.000Z' },
		{ id: 'cmt-5', grievanceId: 'GRV-0003', authorId: 'war-1', body: 'ISP has been notified about the outage in Block A. Escalation reference: #48211.', createdAt: '2026-08-16T04:20:00.000Z' },
		{ id: 'cmt-6', grievanceId: 'GRV-0003', authorId: 'stu-2', body: 'It came back for an hour yesterday evening and dropped again.', createdAt: '2026-08-16T08:40:00.000Z' },
		{ id: 'cmt-7', grievanceId: 'GRV-0004', authorId: 'war-1', body: 'Cleaning schedule for the third floor has been revised. Marking this resolved — please reopen if it regresses.', createdAt: '2026-08-17T06:00:00.000Z' },
		{ id: 'cmt-8', grievanceId: 'GRV-0006', authorId: 'stu-3', body: 'Requesting an update when possible — the noise makes it hard to sleep.', createdAt: '2026-08-18T15:10:00.000Z' },
		{ id: 'cmt-9', grievanceId: 'GRV-0006', authorId: 'war-1', body: 'Generator maintenance is booked for Friday. Apologies for the disturbance.', createdAt: '2026-08-18T16:02:00.000Z' },
		{ id: 'cmt-10', grievanceId: 'GRV-0007', authorId: 'war-1', body: 'Water tank was cleaned and refilled on Sunday. Confirming supply is normal.', createdAt: '2026-08-16T03:30:00.000Z' }
	];

	const attachments = [
		{ id: 'att-1', grievanceId: 'GRV-0001', originalFilename: 'leaking-tap.jpg', mimeType: 'image/jpeg', url: 'https://picsum.photos/400/300', createdAt: '2026-08-13T09:15:00.000Z' },
		{ id: 'att-2', grievanceId: 'GRV-0002', originalFilename: 'corridor-light-off.png', mimeType: 'image/png', url: 'https://picsum.photos/400/300', createdAt: '2026-08-14T18:30:00.000Z' },
		{ id: 'att-3', grievanceId: 'GRV-0003', originalFilename: 'wifi-speedtest.png', mimeType: 'image/png', url: 'https://picsum.photos/400/300', createdAt: '2026-08-15T20:10:00.000Z' },
		{ id: 'att-4', grievanceId: 'GRV-0008', originalFilename: 'mess-area.jpg', mimeType: 'image/jpeg', url: 'https://picsum.photos/400/300', createdAt: '2026-08-19T13:05:00.000Z' }
	];

	await db.$transaction(async (tx) => {
		await tx.user.createMany({ data: users, skipDuplicates: true });
		await tx.grievance.createMany({ data: grievances, skipDuplicates: true });
		await tx.comment.createMany({ data: comments, skipDuplicates: true });
		await tx.attachment.createMany({ data: attachments, skipDuplicates: true });
	});
}
