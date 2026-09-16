import * as v from "valibot";
import { DATE_INPUT_PATTERN, TIME_INPUT_PATTERN } from "@/lib/date-utils";
import {
	createListRule,
	SORT_DIRECTIONS,
	type SortDirection,
} from "@/shared/rules/list.rules";
import { COURSE_MAX_SESSIONS } from "./course.config";
import {
	CourseAudienceRequiredError,
	CourseCapacityBelowEnrolledError,
	CourseDeadlineAfterStartError,
	CourseInvalidTransitionError,
	CourseSessionInvalidRangeError,
	CourseSessionMissingLinkError,
	CourseSessionMissingVenueError,
	CourseTooManySessionsError,
	CourseWithoutActiveTrainerError,
	CourseWithoutSessionsError,
} from "./course.errors";

// ── Vocabulario del módulo ────────────────────────────────────────────────────
//
// Las tres tuplas se declaran aquí y no se importan del cliente de Prisma: el
// dominio no conoce el ORM (reglas §4), y son además la allowlist que valida lo
// que llega del formulario y del query string.

export const COURSE_MODALITIES = ["IN_PERSON", "ONLINE", "HYBRID"] as const;
export type CourseModality = (typeof COURSE_MODALITIES)[number];

export const COURSE_ACCESS_TYPES = [
	"PUBLIC",
	"RESTRICTED",
	"INVITATION",
] as const;
export type CourseAccessType = (typeof COURSE_ACCESS_TYPES)[number];

export const COURSE_STATUSES = [
	"DRAFT",
	"PUBLISHED",
	"FINISHED",
	"CANCELLED",
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

// ── Átomos del módulo ─────────────────────────────────────────────────────────

const title = v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(160));
const description = v.pipe(v.string(), v.trim(), v.maxLength(2000));
const venue = v.pipe(v.string(), v.trim(), v.maxLength(200));

/** Enlace externo: la plataforma no aloja contenido (§6.5). */
const link = v.pipe(v.string(), v.trim(), v.url(), v.maxLength(500));

const documentId = v.pipe(v.string(), v.uuid());

const capacity = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(10000),
);

/** Porcentaje de asistencia exigido para acreditar. */
const minAttendance = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(100),
);

const dateInput = v.pipe(v.string(), v.regex(DATE_INPUT_PATTERN));
const timeInput = v.pipe(v.string(), v.regex(TIME_INPUT_PATTERN));

// ── Entidad y proyecciones ────────────────────────────────────────────────────

export const courseSessionSchema = v.object({
	id: v.number(),
	documentId: v.string(),
	startsAt: v.date(),
	endsAt: v.date(),
	venue: v.nullable(v.string()),
	link: v.nullable(v.string()),
});

/**
 * Capacitador asignado, con la proyección corta del catálogo.
 *
 * `isActive` no es columna: se deriva de que ni el perfil ni la cuenta estén
 * archivados, y es lo que mira `assertPublishable`.
 */
export const courseTrainerSchema = v.object({
	userDocumentId: v.string(),
	firstName: v.nullable(v.string()),
	lastName: v.nullable(v.string()),
	email: v.string(),
	specialty: v.string(),
	isActive: v.boolean(),
});

const audienceEntrySchema = v.object({
	documentId: v.string(),
	name: v.string(),
});

export const courseAudienceSchema = v.object({
	dependencies: v.array(audienceEntrySchema),
	groups: v.array(audienceEntrySchema),
});

export const courseSummarySchema = v.object({
	id: v.number(),
	documentId: v.string(),
	dependencyId: v.number(),
	/** Aplanado del join. El superadministrador ve cursos de varias. */
	dependencyName: v.string(),
	title: v.string(),
	modality: v.picklist(COURSE_MODALITIES),
	access: v.picklist(COURSE_ACCESS_TYPES),
	status: v.picklist(COURSE_STATUSES),
	capacity: v.nullable(v.number()),
	/** Derivados del `_count` y del agregado de sesiones, no son columnas. */
	sessionCount: v.number(),
	trainerCount: v.number(),
	firstSessionAt: v.nullable(v.date()),
	lastSessionAt: v.nullable(v.date()),
	createdByName: v.nullable(v.string()),
	createdAt: v.date(),
	updatedAt: v.date(),
});

export const courseDetailSchema = v.object({
	...courseSummarySchema.entries,
	description: v.nullable(v.string()),
	enrollmentDeadline: v.nullable(v.date()),
	minAttendance: v.number(),
	requiresEvaluation: v.boolean(),
	planLineId: v.nullable(v.number()),
	publishedAt: v.nullable(v.date()),
	cancelledAt: v.nullable(v.date()),
	/** Ordenadas por inicio: el número de sesión de los errores cuenta sobre esto. */
	sessions: v.array(courseSessionSchema),
	trainers: v.array(courseTrainerSchema),
	audience: courseAudienceSchema,
});

/**
 * Columnas ordenables. Es una allowlist: el valor llega del query string y
 * acaba en un `orderBy`.
 */
export const COURSE_SORT_FIELDS = [
	"title",
	"status",
	"modality",
	"createdAt",
] as const;
export type CourseSortField = (typeof COURSE_SORT_FIELDS)[number];

export { SORT_DIRECTIONS, type SortDirection };

// ── Reglas de entrada ─────────────────────────────────────────────────────────

/**
 * Una sesión tal como la captura el formulario: fecha y horas de pared.
 *
 * `documentId` presente significa "esta sesión ya existe": es lo que permite
 * conservar su identidad al editar en vez de borrarla y recrearla.
 */
export const courseSessionInputRule = v.object({
	documentId: v.optional(documentId),
	date: dateInput,
	startTime: timeInput,
	endTime: timeInput,
	venue: v.optional(venue),
	link: v.optional(link),
});

const courseFormShape = {
	title,
	description: v.optional(description),
	modality: v.picklist(COURSE_MODALITIES),
	access: v.picklist(COURSE_ACCESS_TYPES),
	capacity: v.optional(capacity),
	/** Día completo: se resuelve al último minuto de esa fecha (§6.6). */
	enrollmentDeadline: v.optional(dateInput),
	minAttendance: v.optional(minAttendance),
	requiresEvaluation: v.optional(v.boolean()),
	trainers: v.array(documentId),
	audienceDependencies: v.optional(v.array(documentId)),
	audienceGroups: v.optional(v.array(documentId)),
	/**
	 * Vacío es válido: el curso nace en borrador y se completa después. La
	 * exigencia de al menos una sesión es de la publicación, no del guardado.
	 */
	sessions: v.array(courseSessionInputRule),
};

export const createCourseRule = v.object({
	...courseFormShape,
	/**
	 * Dependencia organizadora. Solo la manda el superadministrador; a los demás
	 * se les ignora y se usa la de su alcance.
	 */
	dependency: v.optional(documentId),
});

/**
 * La organizadora NO está: un curso no cambia de dependencia.
 *
 * Moverlo arrastraría su audiencia, sus capacitadores y, desde PRD-06, los
 * créditos que ya otorgó a nombre de la anterior.
 */
export const updateCourseRule = v.object(courseFormShape);

export const findCourseRule = v.object({ documentId });

export const listCoursesRule = createListRule({
	/** Filtro ADICIONAL al alcance: pedir otra dependencia no amplía nada. */
	dependency: v.optional(documentId),
	status: v.optional(v.picklist(COURSE_STATUSES)),
	modality: v.optional(v.picklist(COURSE_MODALITIES)),
	access: v.optional(v.picklist(COURSE_ACCESS_TYPES)),
	sortBy: v.optional(v.picklist(COURSE_SORT_FIELDS)),
	sortDir: v.optional(v.picklist(SORT_DIRECTIONS)),
});

export const courseRules = {
	create: createCourseRule,
	update: updateCourseRule,
	find: findCourseRule,
	list: listCoursesRule,
	session: courseSessionInputRule,
} as const;

// ── Reglas de negocio ─────────────────────────────────────────────────────────

/** Estados desde los que el curso todavía admite cambios. */
export const EDITABLE_STATUSES: readonly CourseStatus[] = [
	"DRAFT",
	"PUBLISHED",
];

export const canEdit = (status: CourseStatus): boolean =>
	EDITABLE_STATUSES.includes(status);

/** Solo desde borrador: republicar un cancelado sería resucitarlo a medias. */
export const canPublish = (status: CourseStatus): boolean => status === "DRAFT";

export const canCancel = (status: CourseStatus): boolean =>
	EDITABLE_STATUSES.includes(status);

export const requiresVenue = (modality: CourseModality): boolean =>
	modality === "IN_PERSON" || modality === "HYBRID";

export const requiresLink = (modality: CourseModality): boolean =>
	modality === "ONLINE" || modality === "HYBRID";

/**
 * Una sesión termina después de empezar.
 *
 * Compara las horas como texto porque `HH:mm` en reloj de 24 ordena
 * lexicográficamente igual que cronológicamente, y las dos son del mismo día.
 */
export const assertSessionRange = (
	session: { startTime: string; endTime: string },
	sessionNumber: number,
): void => {
	if (session.endTime <= session.startTime) {
		throw new CourseSessionInvalidRangeError(sessionNumber);
	}
};

export const assertSessionLimit = (count: number): void => {
	if (count > COURSE_MAX_SESSIONS) {
		throw new CourseTooManySessionsError(COURSE_MAX_SESSIONS);
	}
};

export const assertDeadlineBeforeStart = (
	deadline: Date | null,
	firstSessionAt: Date | null,
): void => {
	if (deadline && firstSessionAt && deadline > firstSessionAt) {
		throw new CourseDeadlineAfterStartError();
	}
};

export const assertCapacityCovers = (
	capacity: number | null,
	enrolled: number,
): void => {
	if (capacity !== null && capacity < enrolled) {
		throw new CourseCapacityBelowEnrolledError(enrolled);
	}
};

/**
 * Las cuatro condiciones de publicación de §6.5.
 *
 * Recibe una forma estructural y no `CourseDetail` para no depender de
 * `course.types.ts`, que a su vez depende de este archivo. Cualquier curso de
 * dominio la satisface.
 */
export const assertPublishable = (course: {
	status: CourseStatus;
	modality: CourseModality;
	access: CourseAccessType;
	sessions: readonly { venue: string | null; link: string | null }[];
	trainers: readonly { isActive: boolean }[];
	audience: { dependencies: readonly unknown[]; groups: readonly unknown[] };
}): void => {
	if (!canPublish(course.status)) {
		throw new CourseInvalidTransitionError(course.status, "PUBLISHED");
	}

	if (course.sessions.length === 0) throw new CourseWithoutSessionsError();

	if (!course.trainers.some((trainer) => trainer.isActive)) {
		throw new CourseWithoutActiveTrainerError();
	}

	course.sessions.forEach((session, index) => {
		const sessionNumber = index + 1;

		if (requiresVenue(course.modality) && !session.venue) {
			throw new CourseSessionMissingVenueError(sessionNumber);
		}
		if (requiresLink(course.modality) && !session.link) {
			throw new CourseSessionMissingLinkError(sessionNumber);
		}
	});

	const audienceSize =
		course.audience.dependencies.length + course.audience.groups.length;

	if (course.access === "RESTRICTED" && audienceSize === 0) {
		throw new CourseAudienceRequiredError();
	}
};
