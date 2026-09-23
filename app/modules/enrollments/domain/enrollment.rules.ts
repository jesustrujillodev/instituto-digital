import * as v from "valibot";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	COURSE_MODALITIES,
	type CourseAccessType,
	type CourseFormat,
	type CourseStatus,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import type { Role } from "@/shared/rules/atoms.rules";
import { createListRule } from "@/shared/rules/list.rules";
import {
	ENROLLMENT_BATCH_LIMIT,
	ENROLLMENT_CLOSING_SOON_DAYS,
	type EnrollmentStatus,
} from "./enrollment.config";
import {
	EnrollmentFullError,
	EnrollmentInvitationRequiredError,
} from "./enrollment.errors";

// ── Reglas de entrada ─────────────────────────────────────────────────────────

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

const documentIds = v.pipe(
	v.array(documentId, "Selecciona los registros del lote."),
	v.maxLength(
		ENROLLMENT_BATCH_LIMIT,
		`No puedes procesar más de ${ENROLLMENT_BATCH_LIMIT} registros a la vez.`,
	),
);

export const findEnrollmentCourseRule = v.object({ documentId });

export const listAvailableCoursesRule = createListRule({
	dependency: v.optional(documentId),
	modality: v.optional(
		v.picklist(COURSE_MODALITIES, "Elige una modalidad válida."),
	),
});

export const searchParticipantsRule = v.object({
	search: v.optional(
		v.pipe(
			v.string("El término de búsqueda debe ser texto."),
			v.trim(),
			v.maxLength(120, "La búsqueda no puede superar los 120 caracteres."),
		),
	),
});

/** Un lote de personas, de grupos o de ambos: lo mismo para inscribir que para invitar. */
const participantBatchRule = v.pipe(
	v.object({
		userDocumentIds: v.optional(documentIds, []),
		groupDocumentIds: v.optional(documentIds, []),
	}),
	v.check(
		(input) => input.userDocumentIds.length + input.groupDocumentIds.length > 0,
		"Elige al menos una persona o un grupo.",
	),
);

export const assignParticipantsRule = participantBatchRule;
export const inviteParticipantsRule = participantBatchRule;

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

const NON_PARTICIPANT_ROLES: readonly Role[] = ["SUPERADMIN"];

/** Solo cursa quien pertenece a una dependencia y no tiene un rol global (§3, §6.6). */
export const canParticipate = (
	actor: Pick<AuthContext, "role" | "dependencyId">,
): boolean =>
	actor.dependencyId !== null && !NON_PARTICIPANT_ROLES.includes(actor.role);

interface EnrollmentWindow {
	status: CourseStatus;
	format: CourseFormat;
	enrollmentDeadline: Date | null;
	enrollmentClosedAt: Date | null;
	firstSessionAt: Date | null;
}

/**
 * La fecha límite o, si no hay, el inicio de la primera sesión (§6.6).
 *
 * Un autogestivo sin fecha límite no tiene cierre: no hay primera sesión que lo
 * alcance y nada obliga a entrar antes de una fecha (docs/adr/0011).
 */
export const enrollmentClosesAt = (course: EnrollmentWindow): Date | null =>
	course.enrollmentDeadline ??
	(requiresSessions(course.format) ? course.firstSessionAt : null);

export const isEnrollmentOpen = (
	course: EnrollmentWindow,
	now: Date,
): boolean => {
	if (course.status !== "PUBLISHED") return false;
	// El cierre a mano del autogestivo manda sobre cualquier fecha (docs/adr/0014).
	if (course.enrollmentClosedAt !== null) return false;

	const closesAt = enrollmentClosesAt(course);
	// Sin cierre, un calendarizado está incompleto —le faltan sesiones— y un
	// autogestivo está abierto mientras siga publicado.
	if (closesAt === null) return !requiresSessions(course.format);

	return now < closesAt;
};

/**
 * Invitar solo tiene sentido donde nadie más puede entrar: en un curso público
 * o restringido, quien está en la audiencia ya puede inscribirse solo.
 */
export const acceptsInvitations = (course: {
	access: CourseAccessType;
}): boolean => course.access === "INVITATION";

/**
 * En un curso por invitación solo se inscribe quien tiene una pendiente.
 *
 * Verlo no basta: quien lo administra o lo imparte lo ve sin estar invitado
 * (`courseVisibilityWhere`), y a su personal se le asigna, no se inscribe solo.
 */
export const canSelfEnroll = (
	course: { access: CourseAccessType },
	current: EnrollmentStatus | null,
): boolean => course.access !== "INVITATION" || current === "INVITED";

export const assertSelfEnrollable = (
	course: { access: CourseAccessType },
	current: EnrollmentStatus | null,
): void => {
	if (!canSelfEnroll(course, current)) {
		throw new EnrollmentInvitationRequiredError();
	}
};

/**
 * Hasta que el curso arranca. Un autogestivo no arranca: se deja cuando sea,
 * salvo que ya se haya completado, porque su crédito quedaría sin inscripción
 * que lo respalde.
 */
export const canWithdraw = (
	course: Pick<EnrollmentWindow, "status" | "format" | "firstSessionAt">,
	now: Date,
	completed: boolean,
): boolean => {
	if (course.status !== "PUBLISHED") return false;
	if (!requiresSessions(course.format)) return !completed;

	return course.firstSessionAt !== null && now < course.firstSessionAt;
};

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
		format: CourseFormat;
		firstSessionAt: Date | null;
		lastSessionEndsAt: Date | null;
	},
	now: Date,
	completed: boolean,
): MyCourseBucket => {
	if (course.status === "FINISHED" || course.status === "CANCELLED") {
		return "finished";
	}
	// Un autogestivo publicado se recorre desde ya y termina, para quien lo
	// cursa, cuando lo completa: el curso no se cierra nunca.
	if (!requiresSessions(course.format)) {
		return completed ? "finished" : "inProgress";
	}

	if (course.lastSessionEndsAt && course.lastSessionEndsAt < now) {
		return "finished";
	}
	if (course.firstSessionAt && course.firstSessionAt <= now) {
		return "inProgress";
	}
	return "upcoming";
};
