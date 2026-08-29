import { statusToUi } from '../http/status.ts';
import type {
	AttachmentRow,
	CommentRow,
	GrievanceCategory,
	PublicAttachment,
	PublicComment,
	PublicGrievance,
	PublicUser,
	GrievanceRow,
	UserRow,
	Role,
	GrievanceStatusDb
} from '../types/index.ts';

export function toPublicUser(row: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'room'>): PublicUser {
	const user: PublicUser = {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role as Role
	};
	if (row.room) {
		user.room = row.room;
	}
	return user;
}

export function toPublicAttachment(row: AttachmentRow): PublicAttachment {
	return {
		id: row.id,
		filename: row.originalFilename,
		contentType: row.mimeType,
		url: row.url
	};
}

export function toPublicComment(row: CommentRow, author: PublicUser): PublicComment {
	return {
		id: row.id,
		grievanceId: row.grievanceId,
		authorId: row.authorId,
		author,
		body: row.body,
		createdAt: row.createdAt
	};
}

export function toPublicGrievance(
	row: GrievanceRow,
	student: PublicUser,
	attachments: PublicAttachment[],
	comments: PublicComment[]
): PublicGrievance {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		category: row.category as GrievanceCategory,
		status: statusToUi(row.status as GrievanceStatusDb),
		studentId: row.studentId,
		student,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		attachments,
		comments
	};
}
