import * as v from "valibot";
import {
	CONTENT_DESCRIPTION_MAX_LENGTH,
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_MAX_ESTIMATED_MINUTES,
} from "./content.config";
import {
	ContentInvalidOrderError,
	ContentModuleNotEmptyError,
	ContentTooManyLessonsError,
	ContentTooManyModulesError,
} from "./content.errors";
import type {
	ContentOrderWrites,
	CourseContentTree,
	ModuleOrderWrite,
	OrderedRow,
	ReorderContentDto,
} from "./content.types";

/** Qué clase de material colgará de la lección (F-04). */
export const LESSON_TYPES = ["TEXT", "FILE", "LINK"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const findContentCourseRule = v.object({ documentId });

const moduleTitle = v.pipe(
	v.string("El nombre del módulo es obligatorio."),
	v.trim(),
	v.minLength(1, "El nombre del módulo es obligatorio."),
	v.maxLength(
		CONTENT_TITLE_MAX_LENGTH,
		`El nombre del módulo no puede superar los ${CONTENT_TITLE_MAX_LENGTH} caracteres.`,
	),
);

const moduleDescription = v.pipe(
	v.optional(v.string("La descripción del módulo debe ser texto."), ""),
	v.trim(),
	v.maxLength(
		CONTENT_DESCRIPTION_MAX_LENGTH,
		`La descripción no puede superar los ${CONTENT_DESCRIPTION_MAX_LENGTH} caracteres.`,
	),
	v.transform((value): string | null => (value === "" ? null : value)),
);

const lessonTitle = v.pipe(
	v.string("El nombre de la lección es obligatorio."),
	v.trim(),
	v.minLength(1, "El nombre de la lección es obligatorio."),
	v.maxLength(
		CONTENT_TITLE_MAX_LENGTH,
		`El nombre de la lección no puede superar los ${CONTENT_TITLE_MAX_LENGTH} caracteres.`,
	),
);

const lessonType = v.picklist(
	LESSON_TYPES,
	"Elige qué clase de material tendrá la lección.",
);

const lessonIsRequired = v.optional(
	v.boolean("Indica si la lección es obligatoria."),
	true,
);

/** Nulo es "sin estimar": el capacitador no siempre sabe cuánto dura. */
const lessonEstimatedMinutes = v.optional(
	v.nullable(
		v.pipe(
			v.number("Los minutos estimados deben ser un número."),
			v.integer("Los minutos estimados deben ser un número entero."),
			v.minValue(1, "Los minutos estimados deben ser al menos 1."),
			v.maxValue(
				LESSON_MAX_ESTIMATED_MINUTES,
				`Los minutos estimados no pueden superar los ${LESSON_MAX_ESTIMATED_MINUTES}.`,
			),
		),
	),
	null,
);

export const createModuleRule = v.object({
	title: moduleTitle,
	description: moduleDescription,
});

export const updateModuleRule = v.object({
	moduleDocumentId: documentId,
	title: moduleTitle,
	description: moduleDescription,
});

export const archiveModuleRule = v.object({ moduleDocumentId: documentId });

export const createLessonRule = v.object({
	moduleDocumentId: documentId,
	title: lessonTitle,
	type: lessonType,
	isRequired: lessonIsRequired,
	estimatedMinutes: lessonEstimatedMinutes,
});

export const updateLessonRule = v.object({
	lessonDocumentId: documentId,
	title: lessonTitle,
	type: lessonType,
	isRequired: lessonIsRequired,
	estimatedMinutes: lessonEstimatedMinutes,
});

export const archiveLessonRule = v.object({ lessonDocumentId: documentId });

/**
 * El orden nuevo COMPLETO, nunca "sube uno".
 *
 * Viaja el árbol entero para que mover una lección de módulo y reordenarla
 * dentro del suyo sean la misma operación.
 */
export const reorderContentRule = v.object({
	modules: v.array(documentId, "Revisa el orden de los módulos."),
	lessons: v.array(
		v.object({
			moduleDocumentId: documentId,
			lessonDocumentIds: v.array(
				documentId,
				"Revisa el orden de las lecciones.",
			),
		}),
		"Revisa el orden de las lecciones.",
	),
});

export const contentRules = {
	findCourse: findContentCourseRule,
	createModule: createModuleRule,
	updateModule: updateModuleRule,
	archiveModule: archiveModuleRule,
	createLesson: createLessonRule,
	updateLesson: updateLessonRule,
	archiveLesson: archiveLessonRule,
	reorder: reorderContentRule,
} as const;

// ── Reglas de negocio ─────────────────────────────────────────────────────────

/**
 * La posición de la fila nueva: siempre al final de sus hermanas.
 *
 * Vale contar porque el orden es contiguo desde 1 entre los hijos activos, y lo
 * sigue siendo tras archivar: `resolveArchiveOrder` re-empaqueta el hueco.
 */
export const nextOrderOf = (siblings: readonly OrderedRow[]): number =>
	siblings.length + 1;

export const assertModuleLimit = (current: number): void => {
	if (current >= CONTENT_MAX_MODULES_PER_COURSE) {
		throw new ContentTooManyModulesError(CONTENT_MAX_MODULES_PER_COURSE);
	}
};

export const assertLessonLimit = (current: number): void => {
	if (current >= CONTENT_MAX_LESSONS_PER_MODULE) {
		throw new ContentTooManyLessonsError(CONTENT_MAX_LESSONS_PER_MODULE);
	}
};

export const assertModuleArchivable = (activeLessons: number): void => {
	if (activeLessons > 0) throw new ContentModuleNotEmptyError(activeLessons);
};

/**
 * Archivar deja un hueco en el orden: los hermanos que quedan se re-empaquetan
 * a 1..n en la misma escritura.
 *
 * Sin esto, la posición del siguiente hijo —que se calcula contando— chocaría
 * con la de uno que ya existe. La fila archivada conserva su último `order`
 * porque ya no la mira nadie.
 */
export const resolveArchiveOrder = (
	archivedDocumentId: string,
	siblings: readonly OrderedRow[],
): ModuleOrderWrite[] =>
	siblings
		.filter((row) => row.documentId !== archivedDocumentId)
		.flatMap((row, index) =>
			row.order === index + 1
				? []
				: [{ documentId: row.documentId, order: index + 1 }],
		);

const assertPermutation = (
	current: readonly string[],
	requested: readonly string[],
): void => {
	if (current.length !== requested.length) throw new ContentInvalidOrderError();

	const stored = new Set(current);
	const seen = new Set<string>();

	for (const id of requested) {
		if (!stored.has(id) || seen.has(id)) throw new ContentInvalidOrderError();
		seen.add(id);
	}
};

/**
 * El árbol pedido contra el guardado: o es una permutación exacta de los dos
 * niveles, o no se escribe nada.
 *
 * Las lecciones se comparan por la unión de todas las listas y no módulo a
 * módulo, porque mover una de módulo es un reordenamiento válido.
 */
export const resolveContentOrder = (
	tree: CourseContentTree,
	requested: ReorderContentDto,
): ContentOrderWrites => {
	assertPermutation(
		tree.map((module) => module.documentId),
		requested.modules,
	);
	assertPermutation(
		tree.map((module) => module.documentId),
		requested.lessons.map((entry) => entry.moduleDocumentId),
	);
	assertPermutation(
		tree.flatMap((module) => module.lessons.map((lesson) => lesson.documentId)),
		requested.lessons.flatMap((entry) => entry.lessonDocumentIds),
	);

	const storedModules = new Map(
		tree.map((module) => [module.documentId, module.order]),
	);
	const storedLessons = new Map(
		tree.flatMap((module) =>
			module.lessons.map(
				(lesson) =>
					[
						lesson.documentId,
						{ moduleDocumentId: module.documentId, order: lesson.order },
					] as const,
			),
		),
	);

	// Solo lo que de verdad se mueve: reordenar dos veces seguidas no reescribe
	// el temario entero.
	return {
		modules: requested.modules.flatMap((documentId, index) =>
			storedModules.get(documentId) === index + 1
				? []
				: [{ documentId, order: index + 1 }],
		),
		lessons: requested.lessons.flatMap((entry) =>
			entry.lessonDocumentIds.flatMap((documentId, index) => {
				const stored = storedLessons.get(documentId);
				const order = index + 1;

				return stored?.order === order &&
					stored.moduleDocumentId === entry.moduleDocumentId
					? []
					: [{ documentId, moduleDocumentId: entry.moduleDocumentId, order }];
			}),
		),
	};
};
