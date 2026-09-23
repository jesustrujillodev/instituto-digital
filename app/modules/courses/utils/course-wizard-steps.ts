import type { PublishCheck } from "../domain/course.rules";
import {
	type CourseCompletionRule,
	type CourseFormat,
	requiresContent,
} from "../domain/course.rules";
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
 * Los pasos del alta, en el orden en que se llena un curso: qué es, cuándo y
 * con quién se imparte, qué se recorre, cómo se completa y quién puede entrar.
 */
export const COURSE_WIZARD_STEPS: readonly CourseStep[] = [
	{
		key: "identity",
		number: 1,
		title: "General",
		summary: "Cómo se llama, qué se aprende y cuánto dura",
		fields: ["dependency", "title", "description", "hours"],
	},
	{
		key: "program",
		number: 2,
		title: "Programa",
		summary: "Quién lo imparte, cuándo y dónde",
		fields: ["format", "modality", "trainers", "sessions"],
	},
	{
		key: "content",
		number: 3,
		title: "Contenido",
		summary: "El temario que se recorre",
		// Vacío a propósito: el temario NO viaja en el payload del curso. Se
		// guarda solo, por intents, contra la ruta del módulo de contenido.
		fields: [],
	},
	{
		key: "rules",
		number: 4,
		title: "Evaluación",
		summary: "Cómo se completa y se evalúa",
		fields: [
			"completionRule",
			"minAttendance",
			"qrOpensBeforeMinutes",
			"qrClosesAfterMinutes",
			"requiresEvaluation",
			"evaluationMethod",
		],
	},
	{
		key: "access",
		number: 5,
		title: "Inscripción",
		summary: "Quién puede entrar y cuántos lugares hay",
		fields: [
			"access",
			"audienceDependencies",
			"audienceGroups",
			"capacity",
			"enrollmentDeadline",
		],
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

/** Lo que decide qué pasos recorre un curso. */
export interface CourseStepShape {
	format: CourseFormat;
	completionRule: CourseCompletionRule;
}

/**
 * Alta de un borrador, o edición de un curso ya publicado: la edición recorre
 * los mismos pasos, pero no tiene revisión porque no publica.
 */
export type CourseWizardMode = "create" | "edit";

/**
 * Los pasos que ESTE curso recorre.
 *
 * Los números no se recalculan: el 3 es Contenido para todo el mundo y un curso
 * sin temario salta del 2 al 4. Así ninguna URL guardada cambia de destino al
 * cambiar el formato o la regla, y `parseStepNumber` sigue siendo función de la
 * URL sola.
 */
export const stepsFor = (
	course: CourseStepShape,
	mode: CourseWizardMode = "create",
): readonly CourseStep[] =>
	COURSE_WIZARD_STEPS.filter(
		(step) =>
			(step.key !== "content" || requiresContent(course)) &&
			(step.key !== "review" || mode === "create"),
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
	trainer: "program",
	audience: "access",
	content: "content",
	quiz: "rules",
};

export type PublishChecklist = readonly {
	check: PublishCheck;
	done: boolean;
}[];

export const stepOfCheck = (check: PublishCheck): CourseStepKey =>
	STEP_OF_CHECK[check];

/** Pasos con algo pendiente. General y Evaluación nunca lo están. */
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
	course: CourseStepShape,
): number => {
	const pending = stepsWithPending(checklist);
	const step = stepsFor(course).find((entry) => pending.has(entry.key));

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

export const stepPath = (
	documentId: string,
	step: number,
	mode: CourseWizardMode = "create",
) =>
	`/dashboard/cursos/${documentId}/${mode === "create" ? "nuevo" : "editar"}/${step}`;

/** A dónde vuelve la edición: la ficha, o la impartición si se entró desde ahí. */
export const RETURN_PARAM = "volver";
export const RETURN_TO_TEACHING = "imparticion";

export const editReturnPath = (documentId: string, returnTo: string | null) =>
	returnTo === RETURN_TO_TEACHING
		? `/dashboard/imparticion/${documentId}`
		: `/dashboard/cursos/${documentId}`;

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
