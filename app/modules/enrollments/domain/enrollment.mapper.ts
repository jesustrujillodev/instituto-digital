import type {
	CourseAccessType,
	CourseFormat,
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
	isClosingSoon,
	isEnrollmentOpen,
	seatsLeftOf,
} from "./enrollment.rules";
import type {
	AvailableCourse,
	EnrollmentCourse,
	OwnEnrollment,
	RosterEntry,
} from "./enrollment.types";

/**
 * Traduce la referencia persistida a la URL con la que se pinta.
 *
 * Llega como argumento y no por import: el resolutor conoce el dominio público
 * configurado, que es infraestructura, y el mapper tiene que seguir siendo puro.
 */
export type CoverResolver = (reference: string | null) => string | null;

export interface EnrollmentCourseRaw {
	id: number;
	documentId: string;
	title: string;
	description: string | null;
	coverImageUrl: string | null;
	modality: CourseModality;
	format: CourseFormat;
	access: CourseAccessType;
	status: CourseStatus;
	capacity: number | null;
	enrollmentDeadline: Date | null;
	finishedAt: Date | null;
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
	resolveCover: CoverResolver,
): EnrollmentCourse => {
	const sessions = raw.sessions.map((session) => ({ ...session }));

	return {
		id: raw.id,
		documentId: raw.documentId,
		dependencyName: raw.dependency.name,
		title: raw.title,
		description: raw.description,
		coverUrl: resolveCover(raw.coverImageUrl),
		modality: raw.modality,
		format: raw.format,
		access: raw.access,
		status: raw.status,
		capacity: raw.capacity,
		enrolledCount: raw._count.enrollments,
		enrollmentDeadline: raw.enrollmentDeadline,
		finishedAt: raw.finishedAt,
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

/** "Luis Ramírez", o el correo si la cuenta no tiene nombre capturado. */
const trainerNameOf = (
	trainer: EnrollmentCourse["trainers"][number] | undefined,
): string | null => {
	if (!trainer) return null;

	const name = [trainer.firstName, trainer.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	return name.length > 0 ? name : trainer.email;
};

export const toAvailableCourse = (
	course: EnrollmentCourse,
	myStatus: EnrollmentStatus | null,
	now: Date,
): AvailableCourse => {
	const closesAt = enrollmentClosesAt(course);

	return {
		documentId: course.documentId,
		title: course.title,
		description: course.description,
		coverUrl: course.coverUrl,
		dependencyName: course.dependencyName,
		modality: course.modality,
		format: course.format,
		access: course.access,
		capacity: course.capacity,
		seatsLeft: seatsLeftOf(course.capacity, course.enrolledCount),
		closesAt,
		closesSoon: isClosingSoon(closesAt, now),
		firstSessionAt: course.firstSessionAt,
		sessionCount: course.sessions.length,
		trainerName: trainerNameOf(course.trainers.at(0)),
		trainerCount: course.trainers.length,
		myStatus,
	};
};

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
