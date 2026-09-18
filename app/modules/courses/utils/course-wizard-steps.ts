import type { PublishCheck } from "../domain/course.rules";
import type { CourseFormValues } from "./build-course-form-defaults";

export type CourseStepKey =
	| "identity"
	| "program"
	| "access"
	| "rules"
	| "review";

export interface CourseStep {
	key: CourseStepKey;
	/** Posición en la URL y en el índice; 1 es el primero. */
	number: number;
	title: string;
	/** Lo que se decide en el paso, para el subtítulo del índice. */
	summary: string;
	/** Campos de react-hook-form que el paso valida antes de guardar. */
	fields: readonly (keyof CourseFormValues)[];
}

/**
 * Los pasos del alta.
 *
 * Acceso va antes que Reglas porque Reglas es el único paso con valores por
 * defecto sanos: es el más salteable y por eso queda pegado a la revisión.
 */
export const COURSE_WIZARD_STEPS: readonly CourseStep[] = [
	{
		key: "identity",
		number: 1,
		title: "Identidad",
		summary: "Cómo se llama y qué se aprende",
		fields: ["dependency", "title", "description"],
	},
	{
		key: "program",
		number: 2,
		title: "Programa",
		summary: "Cuándo y dónde se imparte",
		fields: ["modality", "sessions"],
	},
	{
		key: "access",
		number: 3,
		title: "Acceso",
		summary: "Quién imparte y quién puede entrar",
		fields: [
			"trainers",
			"access",
			"audienceDependencies",
			"audienceGroups",
			"capacity",
			"enrollmentDeadline",
		],
	},
	{
		key: "rules",
		number: 4,
		title: "Reglas",
		summary: "Qué hace falta para completarlo",
		fields: [
			"minAttendance",
			"requiresEvaluation",
			"qrOpensBeforeMinutes",
			"qrClosesAfterMinutes",
		],
	},
	{
		key: "review",
		number: 5,
		title: "Revisión",
		summary: "Repasar y publicar",
		fields: [],
	},
];

export const REVIEW_STEP = COURSE_WIZARD_STEPS[COURSE_WIZARD_STEPS.length - 1];
export const LAST_STEP_NUMBER = REVIEW_STEP.number;

/**
 * En qué paso se resuelve cada pendiente de publicación.
 *
 * Es lo que conecta el índice del alta con `publishChecklist()`: el check de un
 * paso y el pendiente de la ficha son el mismo hecho, calculado una sola vez.
 */
const STEP_OF_CHECK: Record<PublishCheck, CourseStepKey> = {
	sessions: "program",
	places: "program",
	trainer: "access",
	audience: "access",
};

export type PublishChecklist = readonly {
	check: PublishCheck;
	done: boolean;
}[];

export const stepOfCheck = (check: PublishCheck): CourseStepKey =>
	STEP_OF_CHECK[check];

/** Pasos con algo pendiente. Identidad y Reglas nunca lo están. */
export const stepsWithPending = (
	checklist: PublishChecklist,
): Set<CourseStepKey> =>
	new Set(
		checklist
			.filter((entry) => !entry.done)
			.map((entry) => STEP_OF_CHECK[entry.check]),
	);

/**
 * El paso al que lleva "Continuar el alta": el primero con algo pendiente o,
 * si no falta nada, la revisión.
 */
export const firstPendingStep = (checklist: PublishChecklist): number => {
	const pending = stepsWithPending(checklist);
	const step = COURSE_WIZARD_STEPS.find((entry) => pending.has(entry.key));

	return step?.number ?? LAST_STEP_NUMBER;
};

/** El paso que pide la URL, o `null` si el segmento no nombra ninguno. */
export const parseStepNumber = (raw: string | undefined): CourseStep | null => {
	const number = Number(raw);
	if (!Number.isInteger(number)) return null;

	return COURSE_WIZARD_STEPS.find((step) => step.number === number) ?? null;
};

export const stepPath = (documentId: string, step: number) =>
	`/dashboard/cursos/${documentId}/nuevo/${step}`;

/** Pasos con al menos un campo marcado; un error anidado cuenta por su raíz. */
export const stepsWithErrors = (
	errorPaths: readonly string[],
): Set<CourseStepKey> => {
	const roots = new Set(errorPaths.map((path) => path.split(".")[0]));

	return new Set(
		COURSE_WIZARD_STEPS.filter((step) =>
			step.fields.some((field) => roots.has(field)),
		).map((step) => step.key),
	);
};
