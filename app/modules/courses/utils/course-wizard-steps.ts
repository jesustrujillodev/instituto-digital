import type { PublishCheck } from "../domain/course.rules";
import { type CourseFormat, requiresContent } from "../domain/course.rules";
import type { CourseFormValues } from "./build-course-form-defaults";

export type CourseStepKey =
	| "identity"
	| "program"
	| "access"
	| "rules"
	| "content"
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
		fields: ["format", "modality", "sessions"],
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
			"completionRule",
			"minAttendance",
			"requiresEvaluation",
			"qrOpensBeforeMinutes",
			"qrClosesAfterMinutes",
		],
	},
	{
		key: "content",
		number: 5,
		title: "Contenido",
		summary: "El temario que se recorre",
		// Vacío a propósito: el temario NO viaja en el payload del curso. Se
		// guarda solo, por intents, contra la ruta del módulo de contenido.
		fields: [],
	},
	{
		key: "review",
		number: 6,
		title: "Revisión",
		summary: "Repasar y publicar",
		fields: [],
	},
];

export const REVIEW_STEP = COURSE_WIZARD_STEPS[COURSE_WIZARD_STEPS.length - 1];
export const LAST_STEP_NUMBER = REVIEW_STEP.number;

const STEP_BY_KEY = Object.fromEntries(
	COURSE_WIZARD_STEPS.map((step) => [step.key, step]),
) as Record<CourseStepKey, CourseStep>;

export const stepOfKey = (key: CourseStepKey): CourseStep => STEP_BY_KEY[key];

/**
 * Los pasos que ESTE curso recorre.
 *
 * Los números no se recalculan: el 5 es Contenido para todo el mundo y un curso
 * con sesiones salta del 4 al 6. Así ninguna URL guardada cambia de destino al
 * cambiar el formato, y `parseStepNumber` sigue siendo función de la URL sola.
 */
export const stepsForFormat = (format: CourseFormat): readonly CourseStep[] =>
	COURSE_WIZARD_STEPS.filter(
		(step) => step.key !== "content" || requiresContent(format),
	);

/** Posición visible del paso: lo que el índice numera y la barra mide. */
export const stepPosition = (
	steps: readonly CourseStep[],
	step: CourseStep,
): { position: number; total: number } => ({
	position: steps.indexOf(step) + 1,
	total: steps.length,
});

/** El siguiente paso VISIBLE, o `null` si es el último. */
export const nextStep = (
	steps: readonly CourseStep[],
	step: CourseStep,
): CourseStep | null => steps[steps.indexOf(step) + 1] ?? null;

export const previousStep = (
	steps: readonly CourseStep[],
	step: CourseStep,
): CourseStep | null => steps[steps.indexOf(step) - 1] ?? null;

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
	content: "content",
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
export const firstPendingStep = (
	checklist: PublishChecklist,
	format: CourseFormat,
): number => {
	const pending = stepsWithPending(checklist);
	const step = stepsForFormat(format).find((entry) => pending.has(entry.key));

	return step?.number ?? LAST_STEP_NUMBER;
};

export const stepOfNumber = (number: number): CourseStep | null =>
	COURSE_WIZARD_STEPS.find((step) => step.number === number) ?? null;

/** El paso que pide la URL, o `null` si el segmento no nombra ninguno. */
export const parseStepNumber = (raw: string | undefined): CourseStep | null => {
	const number = Number(raw);
	if (!Number.isInteger(number)) return null;

	return stepOfNumber(number);
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
