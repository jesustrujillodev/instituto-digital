import * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import { createResponseSchema } from "@/shared/rules/response.rules";
import type {
	courseSessionInputRule,
	createCourseRule,
	findCourseRule,
	listCoursesRule,
	updateCourseRule,
} from "./course.rules";
import {
	type CourseAccessType,
	type CourseCompletionRule,
	type CourseFormat,
	type CourseModality,
	type CourseStatus,
	courseAudienceSchema,
	courseDetailSchema,
	courseSessionSchema,
	courseSummarySchema,
	courseTrainerSchema,
	type EvaluationMethod,
} from "./course.rules";

export type CourseSummary = v.InferOutput<typeof courseSummarySchema>;
export type CourseDetail = v.InferOutput<typeof courseDetailSchema>;
export type CourseSession = v.InferOutput<typeof courseSessionSchema>;
export type CourseTrainerEntry = v.InferOutput<typeof courseTrainerSchema>;
export type CourseAudience = v.InferOutput<typeof courseAudienceSchema>;

export type CreateCourseDto = v.InferInput<typeof createCourseRule>;
export type UpdateCourseDto = v.InferInput<typeof updateCourseRule>;
export type FindCourseDto = v.InferInput<typeof findCourseRule>;
export type ListCoursesDto = v.InferInput<typeof listCoursesRule>;
export type CourseSessionInput = v.InferInput<typeof courseSessionInputRule>;

// ===============================================================
// Lo que el repositorio ESCRIBE
// ===============================================================

/**
 * Sesión lista para persistir.
 *
 * Las horas de pared ya se resolvieron a instantes UTC en la frontera: ninguna
 * capa por debajo del servicio vuelve a hablar de zonas horarias.
 *
 * `documentId` presente identifica una sesión EXISTENTE, y es lo que permite
 * conservar su identidad al editar en vez de borrarla y recrearla.
 */
export interface CourseSessionData {
	documentId?: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
}

/** Campos comunes a crear y actualizar, con los ids internos ya resueltos. */
export interface CourseWriteData {
	title: string;
	description: string | null;
	hours: number | null;
	modality: CourseModality;
	format: CourseFormat;
	completionRule: CourseCompletionRule;
	access: CourseAccessType;
	capacity: number | null;
	enrollmentDeadline: Date | null;
	minAttendance: number;
	requiresEvaluation: boolean;
	evaluationMethod: EvaluationMethod;
	qrOpensBeforeMinutes: number;
	qrClosesAfterMinutes: number;
	sessions: readonly CourseSessionData[];
	trainerIds: readonly number[];
	audienceDependencyIds: readonly number[];
	audienceGroupIds: readonly number[];
}

/**
 * La organizadora y el autor solo se escriben al crear: un curso no cambia de
 * dependencia ni de autor.
 */
export type CreateCourseData = CourseWriteData & {
	dependencyId: number;
	createdById: number;
	planLineId: number | null;
	/** Referencia del proxy de la portada recién subida, o null si no hay. */
	coverImageUrl: string | null;
};

/**
 * Al actualizar, la portada es OPCIONAL en el sentido fuerte: omitirla significa
 * "no la toques" y mandarla `null` significa "quítala". Si fuera obligatoria,
 * cada guardado del formulario borraría la portada de los cursos que no la
 * cambiaron.
 */
export type UpdateCourseData = CourseWriteData & {
	coverImageUrl?: string | null;
	/** Igual que la portada: ausente conserva, `null` suelta la línea. */
	planLineId?: number | null;
};

// ===============================================================
// Opciones de los selectores del formulario
// ===============================================================

export interface CourseTrainerOption {
	documentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	specialty: string;
}

export interface CourseAudienceOption {
	documentId: string;
	name: string;
	/** Solo en los grupos: quién ve grupos de varias dependencias los distingue. */
	dependencyName?: string;
}

/**
 * Todo lo que el formulario necesita para pintar sus selectores.
 *
 * `dependencies` viene vacío salvo para el alcance global: solo el
 * superadministrador elige la dependencia organizadora, y los demás la heredan.
 * `audienceDependencies` sí va siempre lleno — cualquiera puede abrir su curso
 * a otras dependencias, que es de lo que trata §1 del alcance.
 */
export interface CourseFormOptions {
	trainers: CourseTrainerOption[];
	organizers: CourseAudienceOption[];
	audienceDependencies: CourseAudienceOption[];
	audienceGroups: CourseAudienceOption[];
	canChooseOrganizer: boolean;
	/** Los del ejercicio en curso en adelante, con las líneas que puede ocupar. */
	plans: CoursePlanOption[];
}

export interface CoursePlanLineOption {
	documentId: string;
	title: string;
	plannedMonth: number;
}

export interface CoursePlanOption {
	documentId: string;
	fiscalYear: number;
	/** Para filtrar por la organizadora que elige el superadministrador. */
	dependencyDocumentId: string;
	/** Sin cancelar y sin otro curso activo; la del propio curso cuenta. */
	lines: CoursePlanLineOption[];
}

// ===============================================================
// Asistencia por QR (§6.8)
// ===============================================================
// El tipo lo declara `courses` porque es dueño de la tabla; lo consume el
// modulo `check-in`, igual que `teaching` consume `ResultWrite` de enrollments.

export interface QrCourseSession {
	id: number;
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
}

/**
 * El curso resuelto por su token de QR, con las sesiones ordenadas por inicio.
 *
 * No lleva alcance: el token opaco ES la autorizacion para leerlo, y quien
 * escanea no tiene por que administrar el curso.
 */
export interface QrCourse {
	id: number;
	documentId: string;
	title: string;
	status: CourseStatus;
	dependencyName: string;
	qrOpensBeforeMinutes: number;
	qrClosesAfterMinutes: number;
	sessions: QrCourseSession[];
}

// ===============================================================
// Contrato de respuesta del modulo
// ===============================================================

export type CourseResponse = AppResponse<CourseDetail>;
export type CourseListResponse = AppResponse<CourseSummary[]>;
export type CourseFormOptionsResponse = AppResponse<CourseFormOptions>;

export const courseResponseSchema = createResponseSchema(courseDetailSchema);
export const courseListResponseSchema = createResponseSchema(
	v.array(courseSummarySchema),
);
