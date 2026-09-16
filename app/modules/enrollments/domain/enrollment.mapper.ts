import type {
	CourseAccessType,
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type {
	EnrollmentOrigin,
	EnrollmentResult,
	EnrollmentStatus,
} from "./enrollment.config";
import {
	enrollmentClosesAt,
	isEnrollmentOpen,
	seatsLeftOf,
} from "./enrollment.rules";
import type {
	AvailableCourse,
	EnrollmentCourse,
	OwnEnrollment,
	RosterEntry,
} from "./enrollment.types";

export interface EnrollmentCourseRaw {
	id: number;
	documentId: string;
	title: string;
	description: string | null;
	modality: CourseModality;
	access: CourseAccessType;
	status: CourseStatus;
	capacity: number | null;
	enrollmentDeadline: Date | null;
	dependency: { name: string };
	_count: { enrollments: number };
	sessions: readonly {
		documentId: string;
		startsAt: Date;
		endsAt: Date;
		venue: string | null;
		link: string | null;
	}[];
	trainers: readonly {
		user: { firstName: string | null; lastName: string | null; email: string };
	}[];
}

/** `_count.enrollments` debe venir filtrado a los `ENROLLED`. */
export const toEnrollmentCourse = (
	raw: EnrollmentCourseRaw,
): EnrollmentCourse => {
	const sessions = raw.sessions.map((session) => ({ ...session }));

	return {
		id: raw.id,
		documentId: raw.documentId,
		dependencyName: raw.dependency.name,
		title: raw.title,
		description: raw.description,
		modality: raw.modality,
		access: raw.access,
		status: raw.status,
		capacity: raw.capacity,
		enrolledCount: raw._count.enrollments,
		enrollmentDeadline: raw.enrollmentDeadline,
		sessions,
		trainers: raw.trainers.map(({ user }) => ({ ...user })),
		firstSessionAt: sessions.at(0)?.startsAt ?? null,
		lastSessionEndsAt: sessions.at(-1)?.endsAt ?? null,
	};
};

export const withAvailability = (course: EnrollmentCourse, now: Date) => ({
	...course,
	seatsLeft: seatsLeftOf(course.capacity, course.enrolledCount),
	closesAt: enrollmentClosesAt(course),
	isOpen: isEnrollmentOpen(course, now),
});

export const toAvailableCourse = (
	course: EnrollmentCourse,
	myStatus: EnrollmentStatus | null,
): AvailableCourse => ({
	documentId: course.documentId,
	title: course.title,
	dependencyName: course.dependencyName,
	modality: course.modality,
	access: course.access,
	capacity: course.capacity,
	seatsLeft: seatsLeftOf(course.capacity, course.enrolledCount),
	closesAt: enrollmentClosesAt(course),
	firstSessionAt: course.firstSessionAt,
	sessionCount: course.sessions.length,
	myStatus,
});

export interface OwnEnrollmentRaw {
	documentId: string;
	origin: EnrollmentOrigin;
	status: EnrollmentStatus;
	result: EnrollmentResult;
}

export const toOwnEnrollment = (raw: OwnEnrollmentRaw): OwnEnrollment => ({
	documentId: raw.documentId,
	origin: raw.origin,
	status: raw.status,
	result: raw.result,
});

export interface RosterEntryRaw extends OwnEnrollmentRaw {
	updatedAt: Date;
	dependency: { name: string };
	user: {
		documentId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
	};
}

export const toRosterEntry = (raw: RosterEntryRaw): RosterEntry => ({
	...toOwnEnrollment(raw),
	userDocumentId: raw.user.documentId,
	firstName: raw.user.firstName,
	lastName: raw.user.lastName,
	email: raw.user.email,
	dependencyName: raw.dependency.name,
	updatedAt: raw.updatedAt,
});
