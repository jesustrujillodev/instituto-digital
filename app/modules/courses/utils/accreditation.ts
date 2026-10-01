import {
	type CourseCompletionRule,
	countsAttendance,
	countsContent,
	gradesAutomatically,
} from "../domain/course.rules";

export interface AccreditationInput {
	scheduled: boolean;
	completionRule: CourseCompletionRule;
	minAttendance: number;
	requiresEvaluation: boolean;
	minPassingGrade: number;
	/** `null` mientras el curso no tenga temario. */
	requiredLessons: number | null;
	moduleEvaluations: number;
	countedFollowUps: number;
}

/** «a», «a y b», «a, b y c». */
export const listOf = (items: readonly string[]): string =>
	items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

/** «de el examen» no se dice: se contrae a «del examen». */
const ofThe = (text: string) =>
	text.startsWith("el ") ? `del ${text.slice(3)}` : `de ${text}`;

/** Lo que promedia la calificación, en el orden en que se enseña. */
export const gradedPartsOf = (input: AccreditationInput): string[] => [
	...(input.requiresEvaluation ? ["el examen final"] : []),
	...(countsContent(input.completionRule)
		? ["las evaluaciones del temario"]
		: []),
	...(input.countedFollowUps > 0
		? ["las evaluaciones de seguimiento que cuentan"]
		: []),
];

const lessonsStep = (input: AccreditationInput) => {
	const lessons =
		input.requiredLessons === null
			? "Terminar las lecciones obligatorias"
			: input.requiredLessons === 1
				? "Terminar la lección obligatoria"
				: `Terminar las ${input.requiredLessons} lecciones obligatorias`;
	return input.moduleEvaluations > 0
		? `${lessons} y presentar las evaluaciones de cada módulo.`
		: `${lessons}.`;
};

/**
 * «Así se acredita»: los requisitos del paso Evaluación en frases, en el
 * orden en que se cumplen. El examen final se presenta, no se aprueba: la
 * calificación compensa (docs/adr/0024, 0027).
 */
export const accreditationStepsOf = (input: AccreditationInput): string[] => {
	const automatic = gradesAutomatically(input, input.countedFollowUps);
	const parts = gradedPartsOf(input);

	return [
		...(input.scheduled && countsAttendance(input.completionRule)
			? [`Asistir al menos al ${input.minAttendance} % de las sesiones.`]
			: []),
		...(countsContent(input.completionRule) ? [lessonsStep(input)] : []),
		...(input.requiresEvaluation ? ["Presentar el examen final."] : []),
		...(automatic
			? [
					`Tener una calificación de la capacitación de ${input.minPassingGrade} % o más (promedio ${ofThe(listOf(parts))}).`,
				]
			: []),
	];
};
