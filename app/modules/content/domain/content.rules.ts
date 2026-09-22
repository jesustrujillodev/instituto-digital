import * as v from "valibot";
import {
	type UploadCandidate,
	validateUploadInput,
} from "@/shared/storage/upload-validation";
import {
	CONTENT_DESCRIPTION_MAX_LENGTH,
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_BODY_MAX_BYTES,
	LESSON_BODY_MAX_DEPTH,
	LESSON_FILE,
	LESSON_MATERIAL_PREFIX,
	LESSON_MAX_ESTIMATED_MINUTES,
	LESSON_VIDEO,
} from "./content.config";
import {
	ContentInvalidOrderError,
	ContentMaterialMismatchError,
	ContentModuleNotEmptyError,
	ContentTooManyLessonsError,
	ContentTooManyModulesError,
	ContentUploadInvalidError,
	ContentUploadNotFoundError,
	ContentUploadTooLargeError,
} from "./content.errors";
import type {
	ContentOrderWrites,
	CourseContentTree,
	LessonBlockNode,
	LessonBody,
	LessonEmbed,
	LessonInlineNode,
	LessonListItemNode,
	ModuleOrderWrite,
	OrderedRow,
	ReorderContentDto,
} from "./content.types";

/** Qué clase de material cuelga de la lección: decide el editor que se abre. */
export const LESSON_TYPES = ["TEXT", "FILE", "VIDEO", "LINK"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

/** Los dos que suben un objeto al bucket. Cada uno con su lista y su tope. */
export const LESSON_UPLOAD_KINDS = ["FILE", "VIDEO"] as const;
export type LessonUploadKind = (typeof LESSON_UPLOAD_KINDS)[number];

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

// ── El cuerpo de la lección de texto ──────────────────────────────────────────
//
// El cuerpo se guarda como árbol y se pinta con elementos React, nunca como
// HTML: sin parser ni saneador no queda superficie de XSS que mantener. Lo que
// sostiene esa promesa es esta lista blanca —un nodo desconocido se rechaza, no
// se ignora— y el filtro de protocolo del enlace.

/** Solo http(s): un `javascript:` guardado es una inyección con fecha diferida. */
export const isHttpUrl = (value: string): boolean => {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
};

const httpUrl = (message: string) =>
	v.pipe(
		v.string(message),
		v.trim(),
		v.minLength(1, message),
		v.check(isHttpUrl, message),
	);

const LINK_HREF_MESSAGE = "El enlace debe empezar por http:// o https://.";
const NODE_MESSAGE = "La lección tiene contenido que no se puede guardar.";

const markRule = v.variant(
	"type",
	[
		v.object({ type: v.literal("bold") }),
		v.object({ type: v.literal("italic") }),
		v.object({ type: v.literal("strike") }),
		v.object({ type: v.literal("code") }),
		v.object({
			type: v.literal("link"),
			attrs: v.object({ href: httpUrl(LINK_HREF_MESSAGE) }),
		}),
	],
	NODE_MESSAGE,
);

const textNodeRule = v.object({
	type: v.literal("text"),
	text: v.pipe(v.string(NODE_MESSAGE), v.minLength(1, NODE_MESSAGE)),
	marks: v.optional(v.array(markRule, NODE_MESSAGE)),
});

const inlineNodeRule = v.variant(
	"type",
	[textNodeRule, v.object({ type: v.literal("hardBreak") })],
	NODE_MESSAGE,
);

const inlineContent = v.optional(v.array(inlineNodeRule, NODE_MESSAGE));

// `v.lazy` cierra el ciclo: una lista contiene ítems y un ítem contiene bloques,
// que pueden ser otra lista.
const listItemRule: v.GenericSchema<LessonListItemNode> = v.lazy(() =>
	v.object({
		type: v.literal("listItem"),
		content: v.array(blockNodeRule, NODE_MESSAGE),
	}),
);

const blockNodeRule: v.GenericSchema<LessonBlockNode> = v.lazy(() =>
	v.variant(
		"type",
		[
			v.object({ type: v.literal("paragraph"), content: inlineContent }),
			v.object({
				type: v.literal("heading"),
				attrs: v.object({ level: v.picklist([1, 2, 3], NODE_MESSAGE) }),
				content: inlineContent,
			}),
			v.object({
				type: v.literal("bulletList"),
				content: v.array(listItemRule, NODE_MESSAGE),
			}),
			v.object({
				type: v.literal("orderedList"),
				content: v.array(listItemRule, NODE_MESSAGE),
			}),
			v.object({
				type: v.literal("blockquote"),
				content: v.array(blockNodeRule, NODE_MESSAGE),
			}),
			v.object({
				type: v.literal("codeBlock"),
				content: v.optional(v.array(textNodeRule, NODE_MESSAGE)),
			}),
			v.object({ type: v.literal("horizontalRule") }),
		],
		NODE_MESSAGE,
	),
);

/**
 * Profundidad sin recursión, a propósito.
 *
 * Corre ANTES del parseo estructural para que un documento absurdamente anidado
 * se rechace en vez de agotar la pila dentro de valibot.
 */
const exceedsDepth = (value: unknown): boolean => {
	const pending: { node: unknown; level: number }[] = [
		{ node: value, level: 1 },
	];

	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) break;
		if (current.level > LESSON_BODY_MAX_DEPTH) return true;

		const content = (current.node as { content?: unknown })?.content;
		if (!Array.isArray(content)) continue;
		for (const child of content) {
			pending.push({ node: child, level: current.level + 1 });
		}
	}

	return false;
};

const withinBudget = (value: unknown): boolean => {
	try {
		return JSON.stringify(value).length <= LESSON_BODY_MAX_BYTES;
	} catch {
		return false;
	}
};

export const lessonBodyRule: v.GenericSchema<unknown, LessonBody> = v.pipe(
	v.unknown(),
	v.check(withinBudget, "El contenido de la lección es demasiado extenso."),
	v.check(
		(value) => !exceedsDepth(value),
		"El contenido de la lección tiene demasiados niveles anidados.",
	),
	v.object({
		type: v.literal("doc", NODE_MESSAGE),
		content: v.array(blockNodeRule, NODE_MESSAGE),
	}),
);

// ── El material subido y el enlace ────────────────────────────────────────────

/**
 * La key la emitió este módulo o no se acepta.
 *
 * Sin esto, quien conociera la key de un objeto privado de otro módulo podría
 * colgarlo de una lección suya y volver a servirlo bajo su propio permiso.
 */
const materialKey = v.pipe(
	v.string("Falta el archivo subido."),
	v.trim(),
	v.minLength(1, "Falta el archivo subido."),
	v.check(
		(value) =>
			value.startsWith(`${LESSON_MATERIAL_PREFIX}/`) && !value.includes(".."),
		"El archivo no corresponde al material de una lección.",
	),
);

const materialFileName = v.pipe(
	v.string("Falta el nombre del archivo."),
	v.trim(),
	v.minLength(1, "Falta el nombre del archivo."),
	v.maxLength(255, "El nombre del archivo es demasiado largo."),
);

const materialMimeType = v.pipe(
	v.string("Falta el tipo del archivo."),
	v.trim(),
	v.minLength(1, "Falta el tipo del archivo."),
	v.maxLength(150, "El tipo del archivo no es válido."),
);

const uploadedMaterial = {
	key: materialKey,
	fileName: materialFileName,
	mimeType: materialMimeType,
};

export const findMaterialRule = v.object({ lessonDocumentId: documentId });

export const uploadUrlRule = v.object({
	lessonDocumentId: documentId,
	kind: v.picklist(
		LESSON_UPLOAD_KINDS,
		"Elige qué clase de archivo vas a subir.",
	),
	fileName: materialFileName,
	contentType: materialMimeType,
	size: v.pipe(
		v.number("El tamaño del archivo debe ser un número."),
		v.integer("El tamaño del archivo debe ser un número entero."),
		v.minValue(1, "El archivo está vacío."),
	),
});

/**
 * La coherencia tipo/material vive en el propio contrato de entrada: una lección
 * `LINK` sin enlace no llega a ser un DTO, así que no hace falta una regla
 * aparte que la vuelva a comprobar después.
 */
export const saveMaterialRule = v.variant(
	"type",
	[
		v.object({
			lessonDocumentId: documentId,
			type: v.literal("TEXT"),
			body: lessonBodyRule,
		}),
		v.object({
			lessonDocumentId: documentId,
			type: v.literal("FILE"),
			...uploadedMaterial,
		}),
		v.object({
			lessonDocumentId: documentId,
			type: v.literal("VIDEO"),
			...uploadedMaterial,
		}),
		v.object({
			lessonDocumentId: documentId,
			type: v.literal("LINK"),
			externalUrl: httpUrl(LINK_HREF_MESSAGE),
		}),
	],
	"Elige qué clase de material tendrá la lección.",
);

export const contentRules = {
	findCourse: findContentCourseRule,
	createModule: createModuleRule,
	updateModule: updateModuleRule,
	archiveModule: archiveModuleRule,
	createLesson: createLessonRule,
	updateLesson: updateLessonRule,
	archiveLesson: archiveLessonRule,
	reorder: reorderContentRule,
	findMaterial: findMaterialRule,
	uploadUrl: uploadUrlRule,
	saveMaterial: saveMaterialRule,
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

// ── Reglas del material ───────────────────────────────────────────────────────

export const uploadLimitsOf = (kind: LessonUploadKind) =>
	kind === "VIDEO" ? LESSON_VIDEO : LESSON_FILE;

/** Corre ANTES de firmar: una URL firmada que no debió emitirse ya es el fallo. */
export const assertUploadAllowed = (
	kind: LessonUploadKind,
	candidate: UploadCandidate,
): void => {
	const reason = validateUploadInput(candidate, uploadLimitsOf(kind));
	if (reason) throw new ContentUploadInvalidError(reason);
};

/**
 * El control que la firma no puede dar.
 *
 * Una URL firmada de `PUT` fija el `Content-Type` pero no el tamaño, así que el
 * tope solo existe si se comprueba el objeto ya escrito.
 */
export const requireUploadedObject = <T extends { size: number }>(
	kind: LessonUploadKind,
	object: T | null,
): T => {
	if (!object) throw new ContentUploadNotFoundError();

	const { maxBytes } = uploadLimitsOf(kind);
	if (object.size > maxBytes) {
		throw new ContentUploadTooLargeError(maxBytes, object.size);
	}

	return object;
};

export const assertMaterialMatchesLesson = (
	lessonType: LessonType,
	materialType: LessonType,
): void => {
	if (lessonType !== materialType) {
		throw new ContentMaterialMismatchError(lessonType, materialType);
	}
};

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const YOUTUBE_EMBED = "https://www.youtube-nocookie.com/embed";

/**
 * Lo que el `<iframe>` necesita, o el enlace tal cual si no se reconoce.
 *
 * Nunca lanza: un proveedor desconocido cae en `link` y la pantalla lo enseña
 * como enlace en vez de romperse.
 */
export const resolveEmbed = (url: string): LessonEmbed => {
	const link: LessonEmbed = { kind: "link", href: url };
	if (!isHttpUrl(url)) return link;

	const { hostname, pathname, searchParams } = new URL(url);
	const segments = pathname.split("/").filter(Boolean);
	const embed = (src: string): LessonEmbed => ({ kind: "embed", src });

	if (YOUTUBE_HOSTS.includes(hostname)) {
		const id = searchParams.get("v") ?? segments[1];
		return id ? embed(`${YOUTUBE_EMBED}/${id}`) : link;
	}

	if (hostname === "youtu.be") {
		return segments[0] ? embed(`${YOUTUBE_EMBED}/${segments[0]}`) : link;
	}

	if (hostname === "vimeo.com" || hostname === "www.vimeo.com") {
		return /^\d+$/.test(segments[0] ?? "")
			? embed(`https://player.vimeo.com/video/${segments[0]}`)
			: link;
	}

	if (hostname === "drive.google.com") {
		const id =
			segments[0] === "file" && segments[1] === "d" ? segments[2] : null;
		return id ? embed(`https://drive.google.com/file/d/${id}/preview`) : link;
	}

	return link;
};

const inlineText = (nodes: readonly LessonInlineNode[] | undefined): string =>
	(nodes ?? [])
		.map((node) => (node.type === "text" ? node.text : " "))
		.join("")
		.trim();

const blockText = (block: LessonBlockNode): string => {
	switch (block.type) {
		case "paragraph":
		case "heading":
		case "codeBlock":
			return inlineText(block.content);
		case "bulletList":
		case "orderedList":
			return block.content
				.map((item) => item.content.map(blockText).join(" ").trim())
				.filter((line) => line.length > 0)
				.join("\n");
		case "blockquote":
			return block.content.map(blockText).join("\n");
		case "horizontalRule":
			return "";
		default: {
			const exhaustive: never = block;
			return exhaustive;
		}
	}
};

/** El texto desnudo del cuerpo, para el extracto de la ficha. */
export const toPlainText = (body: LessonBody): string =>
	body.content
		.map(blockText)
		.filter((line) => line.length > 0)
		.join("\n");
