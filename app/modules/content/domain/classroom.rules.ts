import * as v from "valibot";
import type { ClassroomCourse, ClassroomStop } from "./classroom.types";
import {
	ContentClassroomReadOnlyError,
	ContentCourseNotFoundError,
	ContentNotEnrolledError,
} from "./content.errors";
import type {
	ContentLesson,
	ContentModuleQuiz,
	CourseContentTree,
} from "./content.types";

/** Sin fila es «sin empezar»: no hay un tercer valor que lo diga. */
export const LESSON_PROGRESS_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const;
export type LessonProgressStatus = (typeof LESSON_PROGRESS_STATUSES)[number];

/** El porcentaje con el que se da por terminado el contenido. */
export const CONTENT_DONE_PERCENT = 100;

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const findClassroomRule = v.object({ documentId });

export const findClassroomLessonRule = v.object({
	documentId,
	lessonDocumentId: documentId,
});

export const findClassroomModuleQuizRule = v.object({
	documentId,
	moduleDocumentId: documentId,
});

export const recordProgressRule = v.object({
	lessonDocumentId: documentId,
	status: v.picklist(
		LESSON_PROGRESS_STATUSES,
		"Indica si la lección queda empezada o completada.",
	),
});

export const classroomRules = {
	find: findClassroomRule,
	findLesson: findClassroomLessonRule,
	findModuleQuiz: findClassroomModuleQuizRule,
	record: recordProgressRule,
} as const;

// ── Avance ────────────────────────────────────────────────────────────────────

const lessonsOf = (tree: CourseContentTree): ContentLesson[] =>
	tree.flatMap((module) => module.lessons);

/**
 * Lo que mide el avance: las obligatorias. Si el capacitador no marcó ninguna,
 * cuenta el temario entero, para que «todo opcional» no signifique «terminado
 * sin abrir nada» (docs/adr/0014).
 */
export const measuredLessonsOf = (tree: CourseContentTree): ContentLesson[] => {
	const lessons = lessonsOf(tree);
	const required = lessons.filter((lesson) => lesson.isRequired);

	return required.length > 0 ? required : lessons;
};

/** Las evaluaciones de módulo que ya se pueden presentar. */
export const moduleQuizzesOf = (tree: CourseContentTree): ContentModuleQuiz[] =>
	tree.flatMap((module) =>
		module.quiz && module.quiz.questionCount > 0 ? [module.quiz] : [],
	);

/**
 * Todo lo que mide el avance: las lecciones medidas y, aprobadas, las
 * evaluaciones de módulo (docs/adr/0016).
 */
export const measuredItemsOf = (tree: CourseContentTree): string[] => [
	...measuredLessonsOf(tree).map((lesson) => lesson.documentId),
	...moduleQuizzesOf(tree).map((quiz) => quiz.documentId),
];

/**
 * Porcentaje entero y hacia abajo, con el criterio de `attendancePercent`: solo
 * vale 100 cuando no falta nada. Un temario vacío da 0 y nunca completa.
 *
 * `done` junta las lecciones completadas y las evaluaciones de módulo aprobadas.
 */
export const progressPercentOf = (
	tree: CourseContentTree,
	done: ReadonlySet<string>,
): number => {
	const measured = measuredItemsOf(tree);
	if (measured.length === 0) return 0;

	const finished = measured.filter((id) => done.has(id)).length;

	return Math.floor((finished * 100) / measured.length);
};

/** Una parada del recorrido: qué es, si cuenta y con qué clave se da por hecha. */
interface StopEntry {
	stop: ClassroomStop;
	counts: boolean;
	doneKey: string;
}

/**
 * El recorrido del aula en orden: las lecciones de cada módulo y, al final de
 * cada uno, su evaluación si ya tiene preguntas. La evaluación se nombra por su
 * módulo, que es lo que lleva la URL.
 */
const stopsOf = (tree: CourseContentTree): StopEntry[] =>
	tree.flatMap((module) => [
		...module.lessons.map((lesson) => ({
			stop: { kind: "LESSON" as const, documentId: lesson.documentId },
			counts: lesson.isRequired,
			doneKey: lesson.documentId,
		})),
		...(module.quiz && module.quiz.questionCount > 0
			? [
					{
						stop: {
							kind: "MODULE_QUIZ" as const,
							documentId: module.documentId,
						},
						counts: true,
						doneKey: module.quiz.documentId,
					},
				]
			: []),
	]);

/**
 * A dónde lleva «Continuar»: lo primero que cuenta y falta (una obligatoria o
 * una evaluación de módulo sin aprobar); si no queda nada, la primera lección
 * sin completar; y si todo está hecho, la primera parada. Sale de las filas de
 * avance, así que retoma igual en cualquier dispositivo.
 */
export const resumeStopOf = (
	tree: CourseContentTree,
	done: ReadonlySet<string>,
): ClassroomStop | null => {
	const stops = stopsOf(tree);
	const pending = (entry: StopEntry) => !done.has(entry.doneKey);

	return (
		(
			stops.find((entry) => entry.counts && pending(entry)) ??
			stops.find((entry) => entry.stop.kind === "LESSON" && pending(entry)) ??
			stops.at(0)
		)?.stop ?? null
	);
};

/** Una lección completada no vuelve a «empezada» por abrirla otra vez. */
export const nextProgressStatus = (
	stored: LessonProgressStatus | null,
	requested: LessonProgressStatus,
): LessonProgressStatus => (stored === "COMPLETED" ? "COMPLETED" : requested);

/** La parada anterior y la siguiente en el recorrido del temario. */
export const neighborsOf = (
	tree: CourseContentTree,
	current: ClassroomStop,
): { previous: ClassroomStop | null; next: ClassroomStop | null } => {
	const stops = stopsOf(tree).map((entry) => entry.stop);
	const index = stops.findIndex(
		(stop) =>
			stop.kind === current.kind && stop.documentId === current.documentId,
	);

	return {
		previous: index > 0 ? (stops[index - 1] ?? null) : null,
		next: index >= 0 ? (stops[index + 1] ?? null) : null,
	};
};

// ── Quién entra ───────────────────────────────────────────────────────────────

/**
 * El aula se abre a la inscripción activa de un curso publicado o finalizado.
 * Un borrador o un cancelado se ven igual que inexistentes.
 */
export const assertClassroomReadable = (course: ClassroomCourse): void => {
	if (course.status !== "PUBLISHED" && course.status !== "FINISHED") {
		throw new ContentCourseNotFoundError();
	}
	if (course.enrollment?.status !== "ENROLLED") {
		throw new ContentNotEnrolledError();
	}
};

/** Registrar avance exige, además, que el curso siga en curso. */
export const assertCanProgress = (course: ClassroomCourse): void => {
	assertClassroomReadable(course);
	if (course.status !== "PUBLISHED") throw new ContentClassroomReadOnlyError();
};
