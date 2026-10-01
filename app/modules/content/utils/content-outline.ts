import type {
	ContentLesson,
	ContentModule,
	CourseContentTree,
	ReorderContentDto,
} from "../domain/content.types";
import { CONTENT_INTENTS, parseContentFormData } from "./content-form";

/** Lo que el editor del temario tiene abierto a la derecha. */
export type OutlineSelection =
	| { kind: "lesson"; documentId: string }
	| { kind: "module"; documentId: string }
	| { kind: "quiz"; moduleDocumentId: string };

export const isSameSelection = (
	a: OutlineSelection | null,
	b: OutlineSelection | null,
): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Minutos estimados de un conjunto de lecciones; las sin estimar no suman. */
export const minutesOf = (lessons: readonly ContentLesson[]): number =>
	lessons.reduce((sum, lesson) => sum + (lesson.estimatedMinutes ?? 0), 0);

export interface OutlineStats {
	modules: number;
	lessons: number;
	minutes: number;
	withoutMaterial: number;
}

export const outlineStats = (tree: CourseContentTree): OutlineStats => {
	const lessons = tree.flatMap((module) => module.lessons);

	return {
		modules: tree.length,
		lessons: lessons.length,
		minutes: minutesOf(lessons),
		withoutMaterial: lessons.filter((lesson) => !lesson.hasMaterial).length,
	};
};

export interface LessonPosition {
	module: ContentModule;
	moduleIndex: number;
	lesson: ContentLesson;
	lessonIndex: number;
}

/** Dónde vive una lección en el árbol, o `null` si ya no está. */
export const findLesson = (
	tree: CourseContentTree,
	documentId: string,
): LessonPosition | null => {
	for (const [moduleIndex, module] of tree.entries()) {
		const lessonIndex = module.lessons.findIndex(
			(lesson) => lesson.documentId === documentId,
		);
		if (lessonIndex >= 0) {
			return {
				module,
				moduleIndex,
				lesson: module.lessons[lessonIndex],
				lessonIndex,
			};
		}
	}

	return null;
};

/** La lección anterior y la siguiente en el recorrido, cruzando módulos. */
export const neighborsOf = (
	tree: CourseContentTree,
	documentId: string,
): { previous: string | null; next: string | null } => {
	const order = tree.flatMap((module) =>
		module.lessons.map((lesson) => lesson.documentId),
	);
	const index = order.indexOf(documentId);
	if (index < 0) return { previous: null, next: null };

	return {
		previous: order[index - 1] ?? null,
		next: order[index + 1] ?? null,
	};
};

/** Si lo seleccionado sigue en el árbol: tras archivar, deja de estarlo. */
export const selectionExists = (
	tree: CourseContentTree,
	selection: OutlineSelection,
): boolean => {
	switch (selection.kind) {
		case "lesson":
			return findLesson(tree, selection.documentId) !== null;
		case "module":
			return tree.some((module) => module.documentId === selection.documentId);
		// Basta el módulo: una evaluación se selecciona para crearla, antes de
		// que exista.
		case "quiz":
			return tree.some(
				(module) => module.documentId === selection.moduleDocumentId,
			);
	}
};

/** Lo que se abre al entrar: la primera lección, o el primer módulo si no hay. */
export const initialSelection = (
	tree: CourseContentTree,
): OutlineSelection | null => {
	const withLessons = tree.find((module) => module.lessons.length > 0);
	if (withLessons) {
		return { kind: "lesson", documentId: withLessons.lessons[0].documentId };
	}
	const [first] = tree;
	return first ? { kind: "module", documentId: first.documentId } : null;
};

/** "35 min", "1 h 5 min"; lo que se pinta junto a módulos y en el resumen. */
export const formatMinutes = (minutes: number): string => {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;

	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/** Intercambia dos posiciones de un arreglo sin tocar el original. */
export const swapped = <T>(
	values: readonly T[],
	from: number,
	to: number,
): T[] => {
	const next = [...values];
	const moved = next[from];
	next[from] = next[to];
	next[to] = moved;

	return next;
};

/** El orden completo del árbol: la regla de reordenar nunca ve un movimiento relativo. */
export const orderOf = (tree: CourseContentTree): ReorderContentDto => ({
	modules: tree.map((module) => module.documentId),
	lessons: tree.map((module) => ({
		moduleDocumentId: module.documentId,
		lessonDocumentIds: module.lessons.map((lesson) => lesson.documentId),
	})),
});

/** El orden con un módulo movido `delta` lugares. */
export const withModuleMoved = (
	tree: CourseContentTree,
	moduleIndex: number,
	delta: number,
): ReorderContentDto => {
	const order = orderOf(tree);
	return {
		...order,
		modules: swapped(order.modules, moduleIndex, moduleIndex + delta),
	};
};

/** El orden con una lección movida `delta` lugares dentro de su módulo. */
export const withLessonMoved = (
	tree: CourseContentTree,
	moduleIndex: number,
	lessonIndex: number,
	delta: number,
): ReorderContentDto => {
	const order = orderOf(tree);
	return {
		...order,
		lessons: order.lessons.map((entry, index) =>
			index === moduleIndex
				? {
						...entry,
						lessonDocumentIds: swapped(
							entry.lessonDocumentIds,
							lessonIndex,
							lessonIndex + delta,
						),
					}
				: entry,
		),
	};
};

/** Ordena según `ids`; lo que `ids` no nombra conserva su orden, al final. */
const sortedBy = <T>(
	items: readonly T[],
	ids: readonly string[],
	idOf: (item: T) => string,
): T[] => {
	const rank = new Map(ids.map((id, index) => [id, index]));
	return [...items].sort(
		(a, b) =>
			(rank.get(idOf(a)) ?? Number.POSITIVE_INFINITY) -
			(rank.get(idOf(b)) ?? Number.POSITIVE_INFINITY),
	);
};

/** El árbol con el orden pedido aplicado: lo que el servidor guardará. */
export const withOrder = (
	tree: CourseContentTree,
	order: ReorderContentDto,
): CourseContentTree => {
	const lessonsOf = new Map(
		order.lessons.map((entry) => [
			entry.moduleDocumentId,
			entry.lessonDocumentIds,
		]),
	);

	return sortedBy(tree, order.modules, (module) => module.documentId).map(
		(module) => {
			const lessonIds = lessonsOf.get(module.documentId);
			return lessonIds
				? {
						...module,
						lessons: sortedBy(
							module.lessons,
							lessonIds,
							(lesson) => lesson.documentId,
						),
					}
				: module;
		},
	);
};

/** Lo que una mutación del temario en vuelo deja ver ya, antes de la respuesta. */
export type PendingOutlineChange =
	| { kind: "reorder"; order: ReorderContentDto }
	| { kind: "archive-lesson"; lessonDocumentId: string }
	| { kind: "archive-module"; moduleDocumentId: string }
	| { kind: "archive-module-quiz"; moduleDocumentId: string };

/**
 * El árbol como quedará si la mutación sale bien. Si falla, la recarga trae
 * el árbol real y el cambio se deshace solo.
 */
export const withPendingChange = (
	tree: CourseContentTree,
	change: PendingOutlineChange | null,
): CourseContentTree => {
	if (!change) return tree;

	switch (change.kind) {
		case "reorder":
			return withOrder(tree, change.order);
		case "archive-lesson":
			return tree.map((module) =>
				module.lessons.some(
					(lesson) => lesson.documentId === change.lessonDocumentId,
				)
					? {
							...module,
							lessons: module.lessons.filter(
								(lesson) => lesson.documentId !== change.lessonDocumentId,
							),
						}
					: module,
			);
		case "archive-module":
			return tree.filter(
				(module) => module.documentId !== change.moduleDocumentId,
			);
		case "archive-module-quiz":
			return tree.map((module) =>
				module.documentId === change.moduleDocumentId
					? { ...module, quiz: null }
					: module,
			);
	}
};

const stringField = (payload: unknown, key: string): string | null => {
	const value = (payload as Record<string, unknown> | null)?.[key];
	return typeof value === "string" ? value : null;
};

/**
 * Qué cambio del temario lleva en vuelo un envío, leído del mismo formulario
 * que recibe el servidor. Crear o guardar no se adelantan: necesitan lo que el
 * servidor responde.
 */
export const pendingOutlineChangeOf = (
	formData: FormData | undefined,
): PendingOutlineChange | null => {
	if (!formData) return null;
	const { intent, payload } = parseContentFormData(formData);

	switch (intent) {
		case CONTENT_INTENTS.reorder: {
			const order = payload as ReorderContentDto | undefined;
			return Array.isArray(order?.modules) && Array.isArray(order?.lessons)
				? { kind: "reorder", order }
				: null;
		}
		case CONTENT_INTENTS.archiveLesson: {
			const lessonDocumentId = stringField(payload, "lessonDocumentId");
			return lessonDocumentId
				? { kind: "archive-lesson", lessonDocumentId }
				: null;
		}
		case CONTENT_INTENTS.archiveModule:
		case CONTENT_INTENTS.archiveModuleQuiz: {
			const moduleDocumentId = stringField(payload, "moduleDocumentId");
			if (!moduleDocumentId) return null;
			return intent === CONTENT_INTENTS.archiveModule
				? { kind: "archive-module", moduleDocumentId }
				: { kind: "archive-module-quiz", moduleDocumentId };
		}
		default:
			return null;
	}
};

/** Lo que se está creando: su sitio se aparta mientras el servidor responde. */
export type PendingCreation =
	| { kind: "module" }
	| { kind: "lesson"; moduleDocumentId: string };

export const pendingCreationOf = (
	formData: FormData | undefined,
): PendingCreation | null => {
	if (!formData) return null;
	const { intent, payload } = parseContentFormData(formData);

	if (intent === CONTENT_INTENTS.createModule) return { kind: "module" };
	if (intent === CONTENT_INTENTS.createLesson) {
		const moduleDocumentId = stringField(payload, "moduleDocumentId");
		return moduleDocumentId ? { kind: "lesson", moduleDocumentId } : null;
	}
	return null;
};
