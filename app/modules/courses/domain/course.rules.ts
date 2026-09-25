import * as v from "valibot";
import { DATE_INPUT_PATTERN, TIME_INPUT_PATTERN } from "@/lib/date-utils";
import {
	createListRule,
	SORT_DIRECTIONS,
	type SortDirection,
} from "@/shared/rules/list.rules";
import {
	COURSE_HOURS_LIMITS,
	COURSE_MAX_SESSIONS,
	COURSE_QR_WINDOW_LIMITS,
} from "./course.config";
import {
	CourseAudienceRequiredError,
	CourseCapacityBelowEnrolledError,
	CourseCompletionLockedError,
	CourseDeadlineAfterStartError,
	CourseFormatLockedError,
	CourseIncompatibleCompletionRuleError,
	CourseIncompatibleEvaluationMethodError,
	CourseInvalidTransitionError,
	CoursePlanLineLockedError,
	CourseSessionInvalidRangeError,
	CourseSessionMissingLinkError,
	CourseSessionMissingVenueError,
	CourseTooManySessionsError,
	CourseWithoutActiveTrainerError,
	CourseWithoutLessonsError,
	CourseWithoutQuizError,
	CourseWithoutSessionsError,
} from "./course.errors";

// ── Vocabulario del módulo ────────────────────────────────────────────────────
//
// Las tuplas se declaran aquí y no se importan del cliente de Prisma: el
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

/** El eje que `modality` no responde: si el curso se reúne o no. */
export const COURSE_FORMATS = ["SCHEDULED", "SELF_PACED"] as const;
export type CourseFormat = (typeof COURSE_FORMATS)[number];

export const COURSE_COMPLETION_RULES = [
	"ATTENDANCE",
	"CONTENT",
	"BOTH",
] as const;
export type CourseCompletionRule = (typeof COURSE_COMPLETION_RULES)[number];

/** Con qué se evalúa, si se evalúa (docs/adr/0015). */
export const EVALUATION_METHODS = ["MANUAL", "QUIZ"] as const;
export type EvaluationMethod = (typeof EVALUATION_METHODS)[number];

// ── Átomos del módulo ─────────────────────────────────────────────────────────

const title = v.pipe(
	v.string("El título del curso es obligatorio."),
	v.trim(),
	v.minLength(3, "El título debe tener al menos 3 caracteres."),
	v.maxLength(160, "El título no puede superar los 160 caracteres."),
);

const description = v.pipe(
	v.string("La descripción debe ser texto."),
	v.trim(),
	v.maxLength(2000, "La descripción no puede superar los 2000 caracteres."),
);

const venue = v.pipe(
	v.string("La sede debe ser texto."),
	v.trim(),
	v.maxLength(200, "La sede no puede superar los 200 caracteres."),
);

/** Enlace externo: la plataforma no aloja contenido (§6.5). */
const link = v.pipe(
	v.string("El enlace de la sesión debe ser texto."),
	v.trim(),
	v.url("Escribe un enlace válido, con https://"),
	v.maxLength(500, "El enlace no puede superar los 500 caracteres."),
);

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

const capacity = v.pipe(
	v.number("El cupo debe ser un número."),
	v.integer("El cupo debe ser un número entero de personas."),
	v.minValue(1, "El cupo debe ser de al menos 1 persona."),
	v.maxValue(10000, "El cupo no puede superar las 10000 personas."),
);

/** Porcentaje de asistencia exigido para acreditar. */
const minAttendance = v.pipe(
	v.number("La asistencia mínima debe ser un número."),
	v.integer("La asistencia mínima debe ser un porcentaje entero."),
	v.minValue(1, "La asistencia mínima debe ser de al menos 1%."),
	v.maxValue(100, "La asistencia mínima no puede superar el 100%."),
);

const hours = v.pipe(
	v.number("Las horas del curso deben ser un número."),
	v.integer("Las horas del curso deben ser un número entero."),
	v.minValue(
		COURSE_HOURS_LIMITS.min,
		`Las horas del curso deben ser al menos ${COURSE_HOURS_LIMITS.min}.`,
	),
	v.maxValue(
		COURSE_HOURS_LIMITS.max,
		`Las horas del curso no pueden superar las ${COURSE_HOURS_LIMITS.max}.`,
	),
);

/** Minutos de tolerancia de la ventana de escaneo del QR (§6.8). */
const qrWindowMinutes = v.pipe(
	v.number("La tolerancia del QR debe ser un número."),
	v.integer("La tolerancia del QR debe ser un número entero de minutos."),
	v.minValue(
		COURSE_QR_WINDOW_LIMITS.min,
		`La tolerancia del QR debe ser de al menos ${COURSE_QR_WINDOW_LIMITS.min} minutos.`,
	),
	v.maxValue(
		COURSE_QR_WINDOW_LIMITS.max,
		`La tolerancia del QR no puede superar los ${COURSE_QR_WINDOW_LIMITS.max} minutos.`,
	),
);

const dateInput = v.pipe(
	v.string("La fecha es obligatoria."),
	v.regex(DATE_INPUT_PATTERN, "Escribe la fecha con el formato AAAA-MM-DD."),
);

const timeInput = v.pipe(
	v.string("La hora es obligatoria."),
	v.regex(TIME_INPUT_PATTERN, "Escribe la hora con el formato HH:MM."),
);

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
	/** Referencia del proxy de storage, o null. La resuelve quien la pinta. */
	coverImageUrl: v.nullable(v.string()),
	modality: v.picklist(COURSE_MODALITIES),
	format: v.picklist(COURSE_FORMATS),
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
	/** Las capturadas; las efectivas las resuelve `courseHoursOf`. */
	hours: v.nullable(v.number()),
	enrollmentDeadline: v.nullable(v.date()),
	minAttendance: v.number(),
	requiresEvaluation: v.boolean(),
	evaluationMethod: v.picklist(EVALUATION_METHODS),
	completionRule: v.picklist(COURSE_COMPLETION_RULES),
	qrOpensBeforeMinutes: v.number(),
	qrClosesAfterMinutes: v.number(),
	/** Línea del plan anual que lo originó, si la hay (§6.11). */
	planLine: v.nullable(
		v.object({
			documentId: v.string(),
			title: v.string(),
			planDocumentId: v.string(),
			fiscalYear: v.number(),
		}),
	),
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
	hours: v.optional(hours),
	modality: v.picklist(COURSE_MODALITIES, "Elige una modalidad válida."),
	format: v.optional(v.picklist(COURSE_FORMATS, "Elige un formato válido.")),
	access: v.picklist(COURSE_ACCESS_TYPES, "Elige un tipo de acceso válido."),
	capacity: v.optional(capacity),
	/** Día completo: se resuelve al último minuto de esa fecha (§6.6). */
	enrollmentDeadline: v.optional(dateInput),
	minAttendance: v.optional(minAttendance),
	requiresEvaluation: v.optional(
		v.boolean("Indica si el curso exige evaluación."),
	),
	evaluationMethod: v.optional(
		v.picklist(EVALUATION_METHODS, "Elige con qué se evalúa el curso."),
	),
	completionRule: v.optional(
		v.picklist(
			COURSE_COMPLETION_RULES,
			"Elige una regla de completado válida.",
		),
	),
	qrOpensBeforeMinutes: v.optional(qrWindowMinutes),
	qrClosesAfterMinutes: v.optional(qrWindowMinutes),
	trainers: v.array(documentId, "Selecciona los capacitadores del curso."),
	audienceDependencies: v.optional(
		v.array(documentId, "Selecciona las dependencias que pueden inscribirse."),
	),
	audienceGroups: v.optional(
		v.array(documentId, "Selecciona los grupos que pueden inscribirse."),
	),
	/**
	 * Centinela de borrado de la portada.
	 *
	 * `FormData` no transporta `null`, así que "quitar la portada" no puede
	 * viajar como la ausencia del archivo —eso significa "no la toques"—. El
	 * archivo en sí no entra al contrato: un `File` no existe en el servidor con
	 * el mismo tipo y contaminaría un esquema que corre en los dos lados.
	 */
	removeCover: v.optional(v.boolean("Indica si se quita la portada.")),
	/**
	 * Vacío es válido: el curso nace en borrador y se completa después. La
	 * exigencia de al menos una sesión es de la publicación, no del guardado.
	 */
	sessions: v.array(courseSessionInputRule, "Revisa las sesiones del curso."),
};

export const createCourseRule = v.object({
	...courseFormShape,
	/**
	 * Dependencia organizadora. Solo la manda el superadministrador; a los demás
	 * se les ignora y se usa la de su alcance.
	 */
	dependency: v.optional(documentId),
	/** La línea del plan anual que el curso ocupa (§6.11). */
	planLine: v.optional(documentId),
});

/**
 * La organizadora NO está: un curso no cambia de dependencia.
 *
 * Moverlo arrastraría su audiencia, sus capacitadores y, desde PRD-06, los
 * créditos que ya otorgó a nombre de la anterior.
 */
export const updateCourseRule = v.object({
	...courseFormShape,
	/**
	 * Ausente conserva la línea y `null` la suelta. Solo cambia en borrador; un
	 * curso cancelado la conserva como historial.
	 */
	planLine: v.optional(v.nullable(documentId)),
});

export const findCourseRule = v.object({ documentId });

export const listCoursesRule = createListRule({
	/** Filtro ADICIONAL al alcance: pedir otra dependencia no amplía nada. */
	dependency: v.optional(documentId),
	status: v.optional(v.picklist(COURSE_STATUSES, "Elige un estado válido.")),
	modality: v.optional(
		v.picklist(COURSE_MODALITIES, "Elige una modalidad válida."),
	),
	access: v.optional(
		v.picklist(COURSE_ACCESS_TYPES, "Elige un tipo de acceso válido."),
	),
	sortBy: v.optional(
		v.picklist(COURSE_SORT_FIELDS, "No se puede ordenar por ese campo."),
	),
	sortDir: v.optional(
		v.picklist(SORT_DIRECTIONS, "El sentido de ordenación no es válido."),
	),
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

/** La única pregunta que responde el formato: ¿este curso se reúne? */
export const requiresSessions = (format: CourseFormat): boolean =>
	format === "SCHEDULED";

/**
 * Solo un curso que se reúne tiene quién lo imparta. El autogestivo lo opera
 * la dependencia organizadora, que ya pasa por Impartición sin asignación.
 */
export const requiresTrainer = (format: CourseFormat): boolean =>
	requiresSessions(format);

export const countsAttendance = (rule: CourseCompletionRule): boolean =>
	rule === "ATTENDANCE" || rule === "BOTH";

export const countsContent = (rule: CourseCompletionRule): boolean =>
	rule === "CONTENT" || rule === "BOTH";

/**
 * Si el curso tiene que tener temario: el autogestivo, porque no tiene otra cosa,
 * y el que se completa también por contenido (docs/adr/0014).
 */
export const requiresContent = (course: {
	format: CourseFormat;
	completionRule: CourseCompletionRule;
}): boolean =>
	course.format === "SELF_PACED" || course.completionRule === "BOTH";

/**
 * Lo que el módulo de contenido aporta a la publicación: un entero y nada más.
 *
 * Viaja como argumento y no como campo del curso porque sus tablas son de otro
 * módulo; el compilador obliga a cada llamador a decidir de dónde lo saca, y
 * cero lecciones marca pendiente, nunca publicable.
 */
export interface CourseContentFacts {
	/** Lecciones activas, en módulos activos. */
	lessonCount: number;
	/** Preguntas del examen final; 0 si todavía no se armó. */
	finalQuizQuestionCount: number;
}

/** El resultado lo escribe el examen en línea, no quien imparte (docs/adr/0015). */
export const evaluatesByQuiz = (course: {
	requiresEvaluation: boolean;
	evaluationMethod: EvaluationMethod;
}): boolean => course.requiresEvaluation && course.evaluationMethod === "QUIZ";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Las horas que acredita el curso: las capturadas mandan, y la duración de las
 * sesiones es la reserva de los cursos que no las tienen. `null` si no hay ni
 * unas ni otras, que es el autogestivo sin capturar.
 */
export const courseHoursOf = (course: {
	hours: number | null;
	sessions: readonly { startsAt: Date; endsAt: Date }[];
}): number | null => {
	if (course.hours !== null) return course.hours;
	if (course.sessions.length === 0) return null;

	return course.sessions.reduce(
		(total, session) =>
			total + (session.endsAt.getTime() - session.startsAt.getTime()) / HOUR_MS,
		0,
	);
};

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

/**
 * El formato y la regla de completado tienen que poder convivir: un autogestivo
 * no tiene sesiones, así que ninguna regla que cuente asistencia lo completaría.
 */
export const assertCompletionRuleCoherent = (course: {
	format: CourseFormat;
	completionRule: CourseCompletionRule;
}): void => {
	if (
		!requiresSessions(course.format) &&
		countsAttendance(course.completionRule)
	) {
		throw new CourseIncompatibleCompletionRuleError(
			course.format,
			course.completionRule,
		);
	}
};

/**
 * Con qué se evalúa, tal como se guarda.
 *
 * Un autogestivo no tiene capacitador: nadie capturaría su resultado a mano y
 * quien terminó todo se quedaría sin crédito. Solo se evalúa con examen. Si no
 * pide evaluación, el método no se usa y se guarda como examen, igual que su
 * modalidad deja de referirse a nada: así el formulario y lo guardado coinciden.
 */
export const resolveEvaluationMethod = (course: {
	format: CourseFormat;
	requiresEvaluation: boolean;
	evaluationMethod: EvaluationMethod;
}): EvaluationMethod => {
	if (requiresSessions(course.format)) return course.evaluationMethod;

	if (course.requiresEvaluation && course.evaluationMethod === "MANUAL") {
		throw new CourseIncompatibleEvaluationMethodError(
			course.format,
			course.evaluationMethod,
		);
	}
	return "QUIZ";
};

/**
 * Lo que se congela al publicar.
 *
 * En cualquier curso, el método de evaluación: pasar de captura a examen a
 * mitad dejaría resultados medidos de dos formas (docs/adr/0015). En un
 * autogestivo, además, la regla y la evaluación: sus créditos se otorgan
 * conforme cada quien completa, y cambiar el criterio dejaría los ya otorgados
 * medidos con otro (docs/adr/0014).
 */
export const assertCompletionSettingsEditable = (
	stored: {
		status: CourseStatus;
		format: CourseFormat;
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		evaluationMethod: EvaluationMethod;
	},
	next: {
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		evaluationMethod: EvaluationMethod;
	},
): void => {
	if (stored.status === "DRAFT") return;

	if (next.evaluationMethod !== stored.evaluationMethod) {
		throw new CourseCompletionLockedError();
	}
	if (requiresSessions(stored.format)) return;

	if (
		next.completionRule !== stored.completionRule ||
		next.requiresEvaluation !== stored.requiresEvaluation
	) {
		throw new CourseCompletionLockedError();
	}
};

/**
 * El formato se congela al publicar.
 *
 * Pasar a autogestivo borra las sesiones, y con ellas las marcas de asistencia
 * que cuelgan de cada una. Un curso ya publicado no puede perder eso.
 */
export const assertFormatEditable = (
	status: CourseStatus,
	changesFormat: boolean,
): void => {
	if (changesFormat && status !== "DRAFT") throw new CourseFormatLockedError();
};

export const assertPlanLineEditable = (
	status: CourseStatus,
	changesPlanLine: boolean,
): void => {
	if (changesPlanLine && status !== "DRAFT") {
		throw new CoursePlanLineLockedError();
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
export const assertPublishable = (
	course: {
		status: CourseStatus;
		modality: CourseModality;
		format: CourseFormat;
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		evaluationMethod: EvaluationMethod;
		access: CourseAccessType;
		sessions: readonly { venue: string | null; link: string | null }[];
		trainers: readonly { isActive: boolean }[];
		audience: { dependencies: readonly unknown[]; groups: readonly unknown[] };
	},
	content: CourseContentFacts,
): void => {
	if (!canPublish(course.status)) {
		throw new CourseInvalidTransitionError(course.status, "PUBLISHED");
	}

	if (requiresSessions(course.format) && course.sessions.length === 0) {
		throw new CourseWithoutSessionsError();
	}

	if (requiresContent(course) && content.lessonCount === 0) {
		throw new CourseWithoutLessonsError();
	}

	if (evaluatesByQuiz(course) && content.finalQuizQuestionCount === 0) {
		throw new CourseWithoutQuizError();
	}

	if (
		requiresTrainer(course.format) &&
		!course.trainers.some((trainer) => trainer.isActive)
	) {
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

export type PublishCheck =
	| "sessions"
	| "trainer"
	| "places"
	| "audience"
	| "content"
	| "quiz";

/**
 * Las mismas condiciones de `assertPublishable`, pero todas a la vez y sin
 * lanzar: es lo que la ficha de un borrador enseña como lista de pendientes.
 *
 * La audiencia solo aparece si el acceso es restringido, las sesiones y el
 * capacitador si el formato las pide y el temario si no; en los demás casos no
 * hay nada que cumplir.
 */
export const publishChecklist = (
	course: {
		modality: CourseModality;
		format: CourseFormat;
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		evaluationMethod: EvaluationMethod;
		access: CourseAccessType;
		sessions: readonly { venue: string | null; link: string | null }[];
		trainers: readonly { isActive: boolean }[];
		audience: { dependencies: readonly unknown[]; groups: readonly unknown[] };
	},
	content: CourseContentFacts,
): { check: PublishCheck; done: boolean }[] => {
	const placed = course.sessions.every(
		(session) =>
			(!requiresVenue(course.modality) || Boolean(session.venue)) &&
			(!requiresLink(course.modality) || Boolean(session.link)),
	);

	const checks: { check: PublishCheck; done: boolean }[] = [];

	if (requiresSessions(course.format)) {
		checks.push(
			{ check: "sessions", done: course.sessions.length > 0 },
			{ check: "places", done: course.sessions.length > 0 && placed },
		);
	}

	if (requiresContent(course)) {
		checks.push({ check: "content", done: content.lessonCount > 0 });
	}

	if (evaluatesByQuiz(course)) {
		checks.push({ check: "quiz", done: content.finalQuizQuestionCount > 0 });
	}

	if (requiresTrainer(course.format)) {
		checks.push({
			check: "trainer",
			done: course.trainers.some((trainer) => trainer.isActive),
		});
	}

	if (course.access === "RESTRICTED") {
		checks.push({
			check: "audience",
			done:
				course.audience.dependencies.length + course.audience.groups.length > 0,
		});
	}

	return checks;
};

type ScheduledSession = {
	documentId?: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
};

/**
 * ¿Cambió algo que obliga a avisar a inscritos e invitados (§6.5)? Sesiones
 * añadidas o quitadas, otro horario, otra sede u otro enlace. Editar el título o
 * la descripción no cuenta.
 *
 * Una sesión nueva del envío no trae `documentId`, o trae uno que no es de este
 * curso: en los dos casos es un alta.
 */
export const hasScheduleChanges = (
	before: readonly ScheduledSession[],
	after: readonly ScheduledSession[],
): boolean => {
	const previous = new Map(
		before.map((session) => [session.documentId, session]),
	);
	if (after.length !== before.length) return true;

	return after.some((session) => {
		const old = session.documentId
			? previous.get(session.documentId)
			: undefined;
		return (
			!old ||
			old.startsAt.getTime() !== session.startsAt.getTime() ||
			old.endsAt.getTime() !== session.endsAt.getTime() ||
			(old.venue ?? null) !== (session.venue ?? null) ||
			(old.link ?? null) !== (session.link ?? null)
		);
	});
};
