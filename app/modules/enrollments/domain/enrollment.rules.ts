import * as v from "valibot";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	COURSE_MODALITIES,
	type CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { Role } from "@/shared/rules/atoms.rules";
import { createListRule } from "@/shared/rules/list.rules";
import {
	ENROLLMENT_BATCH_LIMIT,
	ENROLLMENT_CLOSING_SOON_DAYS,
	type EnrollmentStatus,
} from "./enrollment.config";
import { EnrollmentFullError } from "./enrollment.errors";

// ── Reglas de entrada ─────────────────────────────────────────────────────────

const documentId = v.pipe(v.string(), v.uuid());

const documentIds = v.pipe(
	v.array(documentId),
	v.maxLength(ENROLLMENT_BATCH_LIMIT),
);

export const findEnrollmentCourseRule = v.object({ documentId });

export const listAvailableCoursesRule = createListRule({
	dependency: v.optional(documentId),
	modality: v.optional(v.picklist(COURSE_MODALITIES)),
});

export const searchParticipantsRule = v.object({
	search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
});

export const assignParticipantsRule = v.object({
	userDocumentIds: v.pipe(documentIds, v.minLength(1)),
});

export const inviteParticipantsRule = v.pipe(
	v.object({
		userDocumentIds: v.optional(documentIds, []),
		groupDocumentIds: v.optional(documentIds, []),
	}),
	v.check(
		(input) => input.userDocumentIds.length + input.groupDocumentIds.length > 0,
		"Elige al menos una persona o un grupo",
	),
);

export const enrollmentRules = {
	findCourse: findEnrollmentCourseRule,
	listAvailable: listAvailableCoursesRule,
	searchParticipants: searchParticipantsRule,
	assign: assignParticipantsRule,
	invite: inviteParticipantsRule,
} as const;

// ── Reglas de negocio ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Si la inscripción cierra dentro de la ventana de urgencia.
 *
 * Un cierre ya pasado no es urgente: es cerrado, y el catálogo ni siquiera lo
 * lista.
 */
export const isClosingSoon = (closesAt: Date | null, now: Date): boolean => {
	if (!closesAt) return false;

	const remaining = closesAt.getTime() - now.getTime();

	return remaining > 0 && remaining <= ENROLLMENT_CLOSING_SOON_DAYS * DAY_MS;
};

const NON_PARTICIPANT_ROLES: readonly Role[] = ["SUPERADMIN", "ADMIN"];

/** Solo cursa quien pertenece a una dependencia y no tiene un rol global (§3, §6.6). */
export const canParticipate = (
	actor: Pick<AuthContext, "role" | "dependencyId">,
): boolean =>
	actor.dependencyId !== null && !NON_PARTICIPANT_ROLES.includes(actor.role);

interface EnrollmentWindow {
	status: CourseStatus;
	enrollmentDeadline: Date | null;
	firstSessionAt: Date | null;
}

/** La fecha límite o, si no hay, el inicio de la primera sesión (§6.6). */
export const enrollmentClosesAt = (course: EnrollmentWindow): Date | null =>
	course.enrollmentDeadline ?? course.firstSessionAt;

export const isEnrollmentOpen = (
	course: EnrollmentWindow,
	now: Date,
): boolean => {
	const closesAt = enrollmentClosesAt(course);

	return course.status === "PUBLISHED" && closesAt !== null && now < closesAt;
};

export const canWithdraw = (
	course: Pick<EnrollmentWindow, "status" | "firstSessionAt">,
	now: Date,
): boolean =>
	course.status === "PUBLISHED" &&
	course.firstSessionAt !== null &&
	now < course.firstSessionAt;

/** `null` cuando el curso no tiene cupo. */
export const seatsLeftOf = (
	capacity: number | null,
	enrolled: number,
): number | null =>
	capacity === null ? null : Math.max(0, capacity - enrolled);

export const assertSeatsFor = (
	capacity: number | null,
	enrolled: number,
	requested: number,
): void => {
	if (capacity !== null && enrolled + requested > capacity) {
		throw new EnrollmentFullError(Math.max(0, capacity - enrolled));
	}
};

const TRANSITIONS: Record<
	EnrollmentStatus | "NONE",
	readonly EnrollmentStatus[]
> = {
	NONE: ["INVITED", "ENROLLED"],
	INVITED: ["ENROLLED", "DECLINED"],
	ENROLLED: ["WITHDRAWN"],
	DECLINED: ["INVITED", "ENROLLED"],
	WITHDRAWN: ["INVITED", "ENROLLED"],
};

export const canTransition = (
	from: EnrollmentStatus | null,
	to: EnrollmentStatus,
): boolean => TRANSITIONS[from ?? "NONE"].includes(to);

export type MyCourseBucket = "upcoming" | "inProgress" | "finished";

export const classifyMyCourse = (
	course: {
		status: CourseStatus;
		firstSessionAt: Date | null;
		lastSessionEndsAt: Date | null;
	},
	now: Date,
): MyCourseBucket => {
	if (course.status === "FINISHED" || course.status === "CANCELLED") {
		return "finished";
	}
	if (course.lastSessionEndsAt && course.lastSessionEndsAt < now) {
		return "finished";
	}
	if (course.firstSessionAt && course.firstSessionAt <= now) {
		return "inProgress";
	}
	return "upcoming";
};
