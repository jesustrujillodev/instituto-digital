import * as v from "valibot";
import {
	DATE_INPUT_PATTERN,
	DISPLAY_DATE_FORMAT,
	TIME_INPUT_PATTERN,
} from "@/lib/date-utils";
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
	CourseFollowUpWithoutQuestionsError,
	CourseFormatLockedError,
	CourseIncompatibleCompletionRuleError,
	CourseInvalidTransitionError,
	CoursePlanLineLockedError,
	CourseSessionInvalidRangeError,
	CourseSessionMissingLinkError,
	CourseSessionMissingPlaceError,
	CourseSessionMissingVenueError,
	CourseTooManySessionsError,
	CourseWithoutActiveTrainerError,
	CourseWithoutLessonsError,
	CourseWithoutQuizError,
	CourseWithoutSessionsError,
} from "./course.errors";

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

const title = v.pipe(
	v.string("El título de la capacitación es obligatorio."),
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

/** Promedio con el que se acredita cuando la nota se calcula sola. */
const minPassingGrade = v.pipe(
	v.number("La calificación mínima aprobatoria debe ser un número."),
	v.integer("La calificación mínima aprobatoria debe ser un número entero."),
	v.minValue(0, "La calificación mínima aprobatoria va de 0 a 100."),
	v.maxValue(100, "La calificación mínima aprobatoria va de 0 a 100."),
);

const hours = v.pipe(
	v.number("Las horas de la capacitación deben ser un número."),
	v.integer("Las horas de la capacitación deben ser un número entero."),
	v.minValue(
		COURSE_HOURS_LIMITS.min,
		`Las horas de la capacitación deben ser al menos ${COURSE_HOURS_LIMITS.min}.`,
	),
	v.maxValue(
		COURSE_HOURS_LIMITS.max,
		`Las horas de la capacitación no pueden superar las ${COURSE_HOURS_LIMITS.max}.`,
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

// El formulario manda `AAAA-MM-DD` solo cuando lo escrito es un día real; lo
// demás llega tal cual y cae aquí, así que el mensaje habla del formato que la
// persona escribe.
const dateInputOf = (field: string) =>
	v.pipe(
		v.string(`Escribe ${field}.`),
		v.minLength(1, `Escribe ${field}.`),
		v.regex(
			DATE_INPUT_PATTERN,
			`Escribe ${field} con el formato ${DISPLAY_DATE_FORMAT}, y que sea un día que exista.`,
		),
	);

const timeInput = v.pipe(
	v.string("La hora es obligatoria."),
	v.regex(TIME_INPUT_PATTERN, "Escribe la hora con el formato HH:MM."),
);

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
	/** En orden de asignación: el nombre, o el correo si no lo tiene. */
	trainerNames: v.array(v.string()),
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
	minPassingGrade: v.number(),
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

/**
 * Una sesión tal como la captura el formulario: fecha y horas de pared.
 *
 * `documentId` presente significa "esta sesión ya existe": es lo que permite
 * conservar su identidad al editar en vez de borrarla y recrearla.
 */
export const courseSessionInputRule = v.object({
	documentId: v.optional(documentId),
	date: dateInputOf("la fecha de la sesión"),
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
	enrollmentDeadline: v.optional(dateInputOf("la fecha límite de inscripción")),
	minAttendance: v.optional(minAttendance),
	requiresEvaluation: v.optional(
		v.boolean("Indica si la capacitación exige evaluación."),
	),
	minPassingGrade: v.optional(minPassingGrade),
	completionRule: v.optional(
		v.picklist(
			COURSE_COMPLETION_RULES,
			"Elige una regla de completado válida.",
		),
	),
	qrOpensBeforeMinutes: v.optional(qrWindowMinutes),
	qrClosesAfterMinutes: v.optional(qrWindowMinutes),
	trainers: v.array(
		documentId,
		"Selecciona los capacitadores de la capacitación.",
	),
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
	sessions: v.array(
		courseSessionInputRule,
		"Revisa las sesiones de la capacitación.",
	),
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
 * Si el curso puede tener sesiones: las exige el calendarizado y las admite el
 * híbrido autogestivo, como encuentros que complementan el temario sin contar
 * para completarlo.
 */
export const allowsSessions = (course: {
	format: CourseFormat;
	modality: CourseModality;
}): boolean => requiresSessions(course.format) || course.modality === "HYBRID";

/**
 * Tiene quién lo imparta todo curso que se reúne o puede reunirse. El
 * autogestivo en línea lo opera la dependencia organizadora, que ya pasa por
 * Impartición sin asignación.
 */
export const requiresTrainer = (course: {
	format: CourseFormat;
	modality: CourseModality;
}): boolean => allowsSessions(course);

/**
 * La modalidad tal como se guarda. «Presencial y autogestivo» no describe nada:
 * un autogestivo es en línea, o híbrido si complementa el temario con sesiones.
 */
export const resolveModality = (course: {
	format: CourseFormat;
	modality: CourseModality;
}): CourseModality => (allowsSessions(course) ? course.modality : "ONLINE");

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
	/** Evaluaciones de seguimiento todavía sin preguntas (docs/adr/0027). */
	followUpsWithoutQuestions: number;
	/** Evaluaciones de seguimiento que cuentan para la calificación. */
	countedFollowUps: number;
}

/**
 * Evaluar es presentar el examen final en línea: no hay captura manual
 * (docs/adr/0027).
 */
export const evaluatesByQuiz = (course: {
	requiresEvaluation: boolean;
}): boolean => course.requiresEvaluation;

/**
 * La nota se calcula sola, como promedio, y se acredita con la mínima del
 * curso: con examen final, con temario que cuenta o con al menos una
 * evaluación de seguimiento que cuenta (docs/adr/0024, 0027).
 */
export const gradesAutomatically = (
	course: {
		requiresEvaluation: boolean;
		completionRule: CourseCompletionRule;
	},
	countedFollowUps = 0,
): boolean =>
	evaluatesByQuiz(course) ||
	countsContent(course.completionRule) ||
	countedFollowUps > 0;

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

export const acceptsVenue = (modality: CourseModality): boolean =>
	modality === "IN_PERSON" || modality === "HYBRID";

export const acceptsLink = (modality: CourseModality): boolean =>
	modality === "ONLINE" || modality === "HYBRID";

/**
 * Si la sesión ya dice dónde se imparte. Una sesión híbrida puede ser
 * presencial o en línea, así que le basta la sede o el enlace.
 */
export const isSessionPlaced = (
	modality: CourseModality,
	session: { venue: string | null; link: string | null },
): boolean => {
	if (modality === "IN_PERSON") return Boolean(session.venue);
	if (modality === "ONLINE") return Boolean(session.link);
	return Boolean(session.venue || session.link);
};

export type SessionPhase = "past" | "current" | "next" | "upcoming";

/**
 * Dónde queda cada sesión respecto a `now`. Solo una es `next`: la primera que
 * aún no empieza, y únicamente si no hay otra en curso.
 */
export const sessionPhasesOf = (
	sessions: readonly { documentId: string; startsAt: Date; endsAt: Date }[],
	now: Date,
): Map<string, SessionPhase> => {
	const phases = new Map<string, SessionPhase>();
	const ordered = [...sessions].sort(
		(a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
	);
	let pointed = false;

	for (const session of ordered) {
		if (session.endsAt <= now) {
			phases.set(session.documentId, "past");
		} else if (session.startsAt <= now) {
			phases.set(session.documentId, "current");
			pointed = true;
		} else {
			phases.set(session.documentId, pointed ? "upcoming" : "next");
			pointed = true;
		}
	}

	return phases;
};

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
 * Lo que se congela al publicar.
 *
 * En cualquier curso, el examen final y la calificación mínima: cambiar
 * cualquiera a mitad dejaría resultados medidos de dos formas (docs/adr/0024,
 * 0027). En un autogestivo, además, la regla: sus créditos se otorgan conforme
 * cada quien completa, y cambiar el criterio dejaría los ya otorgados medidos
 * con otro (docs/adr/0014).
 */
export const assertCompletionSettingsEditable = (
	stored: {
		status: CourseStatus;
		format: CourseFormat;
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		minPassingGrade: number;
	},
	next: {
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		minPassingGrade: number;
	},
): void => {
	if (stored.status === "DRAFT") return;

	if (
		next.requiresEvaluation !== stored.requiresEvaluation ||
		next.minPassingGrade !== stored.minPassingGrade
	) {
		throw new CourseCompletionLockedError();
	}
	if (requiresSessions(stored.format)) return;

	if (next.completionRule !== stored.completionRule) {
		throw new CourseCompletionLockedError();
	}
};

/**
 * El formato se congela al publicar, y con él si el curso admite sesiones.
 *
 * Pasar a autogestivo en línea borra las sesiones, y con ellas las marcas de
 * asistencia que cuelgan de cada una. Un curso ya publicado no puede perder eso.
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

type DeliverableCourse = {
	modality: CourseModality;
	format: CourseFormat;
	access: CourseAccessType;
	sessions: readonly { venue: string | null; link: string | null }[];
	trainers: readonly { isActive: boolean }[];
	audience: { dependencies: readonly unknown[]; groups: readonly unknown[] };
};

const assertHasSessions = (course: DeliverableCourse): void => {
	if (requiresSessions(course.format) && course.sessions.length === 0) {
		throw new CourseWithoutSessionsError();
	}
};

const assertHasActiveTrainer = (course: DeliverableCourse): void => {
	if (
		requiresTrainer(course) &&
		!course.trainers.some((trainer) => trainer.isActive)
	) {
		throw new CourseWithoutActiveTrainerError();
	}
};

const assertSessionsPlaced = (course: DeliverableCourse): void => {
	course.sessions.forEach((session, index) => {
		if (isSessionPlaced(course.modality, session)) return;

		const sessionNumber = index + 1;
		if (course.modality === "IN_PERSON") {
			throw new CourseSessionMissingVenueError(sessionNumber);
		}
		if (course.modality === "ONLINE") {
			throw new CourseSessionMissingLinkError(sessionNumber);
		}
		throw new CourseSessionMissingPlaceError(sessionNumber);
	});
};

const assertHasAudience = (course: DeliverableCourse): void => {
	const audienceSize =
		course.audience.dependencies.length + course.audience.groups.length;

	if (course.access === "RESTRICTED" && audienceSize === 0) {
		throw new CourseAudienceRequiredError();
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
	course: DeliverableCourse & {
		status: CourseStatus;
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
	},
	content: CourseContentFacts,
): void => {
	if (!canPublish(course.status)) {
		throw new CourseInvalidTransitionError(course.status, "PUBLISHED");
	}

	assertHasSessions(course);

	if (requiresContent(course) && content.lessonCount === 0) {
		throw new CourseWithoutLessonsError();
	}

	if (evaluatesByQuiz(course) && content.finalQuizQuestionCount === 0) {
		throw new CourseWithoutQuizError();
	}

	if (content.followUpsWithoutQuestions > 0) {
		throw new CourseFollowUpWithoutQuestionsError(
			content.followUpsWithoutQuestions,
		);
	}

	assertHasActiveTrainer(course);
	assertSessionsPlaced(course);
	assertHasAudience(course);
};

/**
 * Lo de §6.5 que el formulario del curso puede deshacer en uno ya publicado:
 * sesiones, capacitador, sede o enlace y audiencia. El temario y los exámenes
 * se editan en `content`.
 */
export const assertStaysPublishable = (course: DeliverableCourse): void => {
	assertHasSessions(course);
	assertHasActiveTrainer(course);
	assertSessionsPlaced(course);
	assertHasAudience(course);
};

export type PublishCheck =
	| "sessions"
	| "trainer"
	| "places"
	| "audience"
	| "content"
	| "quiz"
	| "followUps";

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
		access: CourseAccessType;
		sessions: readonly { venue: string | null; link: string | null }[];
		trainers: readonly { isActive: boolean }[];
		audience: { dependencies: readonly unknown[]; groups: readonly unknown[] };
	},
	content: CourseContentFacts,
): { check: PublishCheck; done: boolean }[] => {
	const placed = course.sessions.every((session) =>
		isSessionPlaced(course.modality, session),
	);

	const checks: { check: PublishCheck; done: boolean }[] = [];

	if (requiresSessions(course.format)) {
		checks.push(
			{ check: "sessions", done: course.sessions.length > 0 },
			{ check: "places", done: course.sessions.length > 0 && placed },
		);
	} else if (allowsSessions(course) && course.sessions.length > 0) {
		// Las sesiones del híbrido autogestivo son opcionales, pero las que haya
		// tienen que decir dónde se imparten.
		checks.push({ check: "places", done: placed });
	}

	if (requiresContent(course)) {
		checks.push({ check: "content", done: content.lessonCount > 0 });
	}

	if (evaluatesByQuiz(course)) {
		checks.push({ check: "quiz", done: content.finalQuizQuestionCount > 0 });
	}

	if (content.followUpsWithoutQuestions > 0) {
		checks.push({ check: "followUps", done: false });
	}

	if (requiresTrainer(course)) {
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
