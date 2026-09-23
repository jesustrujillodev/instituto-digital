import * as v from "valibot";
import { EMPTY_LESSON_BODY } from "./content.config";
import { type LessonType, lessonBodyRule, resolveEmbed } from "./content.rules";
import type {
	ContentLesson,
	ContentModule,
	ContentSummary,
	CourseContentTree,
	LessonBody,
	LessonMaterial,
} from "./content.types";

export interface ContentLessonRaw {
	documentId: string;
	title: string;
	type: LessonType;
	order: number;
	isRequired: boolean;
	estimatedMinutes: number | null;
	content: { fileUrl: string | null; externalUrl: string | null } | null;
	/** Solo en `QUIZ`: sus preguntas son su material. */
	quiz: { _count: { questions: number } } | null;
}

/**
 * Una fila que `release` vació —porque el objeto se borró desde el gestor de
 * nube— deja de contar como material, aunque la fila siga ahí.
 */
const hasMaterialOf = (raw: ContentLessonRaw): boolean => {
	if (raw.type === "QUIZ") return (raw.quiz?._count.questions ?? 0) > 0;
	if (!raw.content) return false;
	if (raw.type === "TEXT") return true;

	return Boolean(raw.content.fileUrl ?? raw.content.externalUrl);
};

export interface ContentModuleRaw {
	documentId: string;
	title: string;
	description: string | null;
	order: number;
	lessons: readonly ContentLessonRaw[];
}

const toLesson = (raw: ContentLessonRaw): ContentLesson => ({
	documentId: raw.documentId,
	title: raw.title,
	type: raw.type,
	order: raw.order,
	isRequired: raw.isRequired,
	estimatedMinutes: raw.estimatedMinutes,
	hasMaterial: hasMaterialOf(raw),
});

const toModule = (raw: ContentModuleRaw): ContentModule => ({
	documentId: raw.documentId,
	title: raw.title,
	description: raw.description,
	order: raw.order,
	lessons: raw.lessons.map(toLesson),
});

export const toCourseContentTree = (
	rows: readonly ContentModuleRaw[],
): CourseContentTree => rows.map(toModule);

export const toContentSummary = (tree: CourseContentTree): ContentSummary => {
	const lessons = tree.flatMap((module) => module.lessons);

	return {
		moduleCount: tree.length,
		lessonCount: lessons.length,
		requiredLessonCount: lessons.filter((lesson) => lesson.isRequired).length,
	};
};

export interface LessonMaterialRaw {
	documentId: string;
	title: string;
	type: LessonType;
	content: {
		body: unknown;
		fileUrl: string | null;
		fileName: string | null;
		fileSize: number | null;
		mimeType: string | null;
		externalUrl: string | null;
	} | null;
}

/**
 * Lectura tolerante del blob, como `theme.mapper.ts`.
 *
 * Un documento que ya no encaja en la lista blanca —porque la fila quedó de un
 * esquema anterior o porque alguien la escribió fuera de la aplicación— cae al
 * documento vacío. Es el precio de no migrar cada vez que se añade un bloque.
 */
export const toLessonBody = (value: unknown): LessonBody | null => {
	if (value === null || value === undefined) return null;

	const parsed = v.safeParse(lessonBodyRule, value);
	return parsed.success ? parsed.output : EMPTY_LESSON_BODY;
};

/**
 * El material listo para la pantalla.
 *
 * `fileUrl` sale con la referencia persistida: quien lo sirve la sustituye por
 * una URL firmada. Si se olvidara, el cliente recibiría la referencia del proxy,
 * que sigue exigiendo sesión — el fallo cae del lado seguro.
 */
export const toLessonMaterial = (raw: LessonMaterialRaw): LessonMaterial => {
	const content = raw.content;
	const externalUrl = content?.externalUrl ?? null;

	return {
		lessonDocumentId: raw.documentId,
		title: raw.title,
		type: raw.type,
		body: toLessonBody(content?.body),
		fileUrl: content?.fileUrl ?? null,
		downloadUrl: null,
		fileName: content?.fileName ?? null,
		fileSize: content?.fileSize ?? null,
		mimeType: content?.mimeType ?? null,
		externalUrl,
		embed: externalUrl ? resolveEmbed(externalUrl) : null,
	};
};
