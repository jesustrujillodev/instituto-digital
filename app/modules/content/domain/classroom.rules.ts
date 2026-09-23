import * as v from "valibot";
import type { ClassroomCourse } from "./classroom.types";
import {
	ContentClassroomReadOnlyError,
	ContentCourseNotFoundError,
	ContentNotEnrolledError,
} from "./content.errors";
import type { ContentLesson, CourseContentTree } from "./content.types";

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

/**
 * Porcentaje entero y hacia abajo, con el criterio de `attendancePercent`: solo
 * vale 100 cuando no falta ninguna. Un temario vacío da 0 y nunca completa.
 */
export const progressPercentOf = (
	tree: CourseContentTree,
	completed: ReadonlySet<string>,
): number => {
	const measured = measuredLessonsOf(tree);
	if (measured.length === 0) return 0;

	const done = measured.filter((lesson) =>
		completed.has(lesson.documentId),
	).length;

	return Math.floor((done * 100) / measured.length);
};

/**
 * A dónde lleva «Continuar»: la primera obligatoria sin completar; si no queda
 * ninguna, la primera lección sin completar; y si todo está hecho, la primera.
 * Sale de las filas de avance, así que retoma igual en cualquier dispositivo.
 */
export const resumeLessonOf = (
	tree: CourseContentTree,
	completed: ReadonlySet<string>,
): string | null => {
	const lessons = lessonsOf(tree);
	const pending = (lesson: ContentLesson) => !completed.has(lesson.documentId);

	return (
		(
			lessons.find((lesson) => lesson.isRequired && pending(lesson)) ??
			lessons.find(pending) ??
			lessons.at(0) ??
			null
		)?.documentId ?? null
	);
};

/** Una lección completada no vuelve a «empezada» por abrirla otra vez. */
export const nextProgressStatus = (
	stored: LessonProgressStatus | null,
	requested: LessonProgressStatus,
): LessonProgressStatus => (stored === "COMPLETED" ? "COMPLETED" : requested);

/** La lección anterior y la siguiente en el orden del temario. */
export const neighborsOf = (
	tree: CourseContentTree,
	lessonDocumentId: string,
): { previous: string | null; next: string | null } => {
	const lessons = lessonsOf(tree);
	const index = lessons.findIndex(
		(lesson) => lesson.documentId === lessonDocumentId,
	);

	return {
		previous: index > 0 ? (lessons[index - 1]?.documentId ?? null) : null,
		next: index >= 0 ? (lessons[index + 1]?.documentId ?? null) : null,
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
