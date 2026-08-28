import type { User, Grievance, Comment, Attachment } from '@prisma/client';

export type Role = 'student' | 'warden';

export type GrievanceStatusDb = 'open' | 'in_progress' | 'resolved';

/** Status strings the Svelte UI already uses. */
export type GrievanceStatusUi = 'Open' | 'In Progress' | 'Resolved';

export type GrievanceCategory =
	| 'Maintenance'
	| 'Water'
	| 'Electricity'
	| 'Internet'
	| 'Cleanliness'
	| 'Room'
	| 'Other';

export interface PublicUser {
	id: string;
	name: string;
	email: string;
	role: Role;
	room?: string;
}

export interface PublicAttachment {
	id: string;
	filename: string;
	contentType: string;
	url: string;
}

export interface PublicComment {
	id: string;
	grievanceId: string;
	authorId: string;
	author: PublicUser;
	body: string;
	createdAt: string;
}

export interface PublicGrievance {
	id: string;
	title: string;
	description: string;
	category: GrievanceCategory;
	status: GrievanceStatusUi;
	studentId: string;
	student: PublicUser;
	createdAt: string;
	updatedAt: string;
	attachments: PublicAttachment[];
	comments: PublicComment[];
}

export type UserRow = User;
export type GrievanceRow = Grievance;
export type CommentRow = Comment;
export type AttachmentRow = Attachment;

export interface SessionUser {
	id: string;
	name: string;
	email: string;
	role: Role;
	room: string | null;
	created_at: string; // Session might still use snake_case if we don't change auth jwt payload
}

export type ErrorCode =
	| 'bad_request'
	| 'unauthenticated'
	| 'unauthorized'
	| 'forbidden'
	| 'too_many_requests'
	| 'not_found'
	| 'conflict'
	| 'internal';
