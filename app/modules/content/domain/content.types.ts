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
	updateLessonRule,
	updateModuleRule,
} from "./content.rules";

export type CreateModuleDto = v.InferOutput<typeof createModuleRule>;
export type UpdateModuleDto = v.InferOutput<typeof updateModuleRule>;
export type ArchiveModuleDto = v.InferOutput<typeof archiveModuleRule>;
export type CreateLessonDto = v.InferOutput<typeof createLessonRule>;
export type UpdateLessonDto = v.InferOutput<typeof updateLessonRule>;
export type ArchiveLessonDto = v.InferOutput<typeof archiveLessonRule>;
export type ReorderContentDto = v.InferOutput<typeof reorderContentRule>;

export interface ContentLesson {
	documentId: string;
	title: string;
	type: LessonType;
	order: number;
	isRequired: boolean;
	estimatedMinutes: number | null;
}

export interface ContentModule {
	documentId: string;
	title: string;
	description: string | null;
	order: number;
	lessons: ContentLesson[];
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
