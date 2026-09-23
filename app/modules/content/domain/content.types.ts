import type * as v from "valibot";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	archiveLessonRule,
	archiveModuleRule,
	createLessonRule,
	createModuleRule,
	LessonType,
	reorderContentRule,
	saveMaterialRule,
	updateLessonRule,
	updateModuleRule,
	uploadUrlRule,
} from "./content.rules";

export type CreateModuleDto = v.InferOutput<typeof createModuleRule>;
export type UpdateModuleDto = v.InferOutput<typeof updateModuleRule>;
export type ArchiveModuleDto = v.InferOutput<typeof archiveModuleRule>;
export type CreateLessonDto = v.InferOutput<typeof createLessonRule>;
export type UpdateLessonDto = v.InferOutput<typeof updateLessonRule>;
export type ArchiveLessonDto = v.InferOutput<typeof archiveLessonRule>;
export type ReorderContentDto = v.InferOutput<typeof reorderContentRule>;
export type SaveMaterialDto = v.InferOutput<typeof saveMaterialRule>;
export type UploadUrlDto = v.InferOutput<typeof uploadUrlRule>;

export interface ContentLesson {
	documentId: string;
	title: string;
	type: LessonType;
	order: number;
	isRequired: boolean;
	estimatedMinutes: number | null;
	/** Para señalar en el árbol las lecciones que todavía no enseñan nada. */
	hasMaterial: boolean;
}

/** La evaluación del módulo (docs/adr/0016). Aprobarla cuenta como contenido. */
export interface ContentModuleQuiz {
	documentId: string;
	title: string;
	questionCount: number;
}

export interface ContentModule {
	documentId: string;
	title: string;
	description: string | null;
	order: number;
	lessons: ContentLesson[];
	quiz: ContentModuleQuiz | null;
}

/** El temario de un curso: sin lo archivado y en su orden. */
export type CourseContentTree = ContentModule[];

/** Lo que la ficha y el checklist de publicación necesitan saber del temario. */
export interface ContentSummary {
	moduleCount: number;
	lessonCount: number;
	requiredLessonCount: number;
}

/** El curso visto desde este módulo: lo justo para autorizar y ramificar. */
export interface ContentCourseRef {
	id: number;
	status: CourseStatus;
	format: CourseFormat;
}

export interface ModuleWrite {
	title: string;
	description: string | null;
	order: number;
}

export interface LessonWrite {
	title: string;
	type: LessonType;
	isRequired: boolean;
	estimatedMinutes: number | null;
	order: number;
}

/** Un hijo activo con su posición, tal como el repositorio lo lee. */
export interface OrderedRow {
	documentId: string;
	order: number;
}

export type ModuleOrderWrite = OrderedRow;

/** Lleva el módulo destino: reordenar y mover de módulo son lo mismo. */
export interface LessonOrderWrite extends OrderedRow {
	moduleDocumentId: string;
}

export interface ContentOrderWrites {
	modules: ModuleOrderWrite[];
	lessons: LessonOrderWrite[];
}

export type ContentTreeResponse = AppResponse<CourseContentTree>;
export type ContentSummaryResponse = AppResponse<ContentSummary>;
export type ContentMutationResponse = AppResponse<null>;

// ── El cuerpo de una lección de texto ─────────────────────────────────────────
//
// Lista blanca cerrada de nodos, declarada a mano porque el esquema valibot es
// recursivo y necesita el tipo para anotarse. Es la forma que emite Tiptap, pero
// reducida a lo que el renderizador sabe pintar: lo que no está aquí se rechaza
// al guardar y se descarta al leer.

export type LessonMark =
	| { type: "bold" | "italic" | "strike" | "code" }
	| { type: "link"; attrs: { href: string } };

export interface LessonTextNode {
	type: "text";
	text: string;
	marks?: LessonMark[];
}

export interface LessonHardBreakNode {
	type: "hardBreak";
}

export type LessonInlineNode = LessonTextNode | LessonHardBreakNode;

export interface LessonParagraphNode {
	type: "paragraph";
	content?: LessonInlineNode[];
}

export interface LessonHeadingNode {
	type: "heading";
	attrs: { level: 1 | 2 | 3 };
	content?: LessonInlineNode[];
}

export interface LessonListItemNode {
	type: "listItem";
	content: LessonBlockNode[];
}

export interface LessonBulletListNode {
	type: "bulletList";
	content: LessonListItemNode[];
}

export interface LessonOrderedListNode {
	type: "orderedList";
	content: LessonListItemNode[];
}

export interface LessonBlockquoteNode {
	type: "blockquote";
	content: LessonBlockNode[];
}

export interface LessonCodeBlockNode {
	type: "codeBlock";
	content?: LessonTextNode[];
}

export interface LessonHorizontalRuleNode {
	type: "horizontalRule";
}

export type LessonBlockNode =
	| LessonParagraphNode
	| LessonHeadingNode
	| LessonBulletListNode
	| LessonOrderedListNode
	| LessonBlockquoteNode
	| LessonCodeBlockNode
	| LessonHorizontalRuleNode;

export interface LessonBody {
	type: "doc";
	content: LessonBlockNode[];
}

// ── El material ───────────────────────────────────────────────────────────────

/** Un enlace externo: se incrusta si se reconoce el proveedor, si no se enseña. */
export type LessonEmbed =
	| { kind: "embed"; src: string }
	| { kind: "link"; href: string };

/** El material tal como lo lee quien edita la lección o quien la recorre. */
export interface LessonMaterial {
	lessonDocumentId: string;
	title: string;
	type: LessonType;
	body: LessonBody | null;
	/** Firmada en el servidor y en cada carga: la key cruda no viaja al cliente. */
	fileUrl: string | null;
	/** La misma firma, pero forzando la descarga en vez de la vista incrustada. */
	downloadUrl: string | null;
	fileName: string | null;
	fileSize: number | null;
	mimeType: string | null;
	externalUrl: string | null;
	embed: LessonEmbed | null;
}

/** Lo que el servidor escribe en la fila del material, ya resuelto. */
export interface LessonMaterialWrite {
	body: LessonBody | null;
	fileUrl: string | null;
	fileName: string | null;
	fileSize: number | null;
	mimeType: string | null;
	externalUrl: string | null;
}

/** El permiso de subida: el navegador escribe en el bucket y confirma después. */
export interface UploadTicket {
	key: string;
	uploadUrl: string;
	expiresInSeconds: number;
}

export type MaterialResponse = AppResponse<LessonMaterial>;
export type UploadTicketResponse = AppResponse<UploadTicket>;
