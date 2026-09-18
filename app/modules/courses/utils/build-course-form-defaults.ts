import { utcToZonedInput } from "@/lib/date-utils";
import { COURSE_DEFAULTS } from "../domain/course.config";
import type { CourseAccessType, CourseModality } from "../domain/course.rules";
import type { CourseDetail } from "../domain/course.types";

/**
 * Una sesión tal como la ve el formulario: todo texto, que es lo que producen
 * los inputs. `documentId` vacío significa sesión nueva.
 */
export interface CourseSessionFormValues {
	documentId: string;
	date: string;
	startTime: string;
	endTime: string;
	venue: string;
	link: string;
}

export interface CourseFormValues {
	title: string;
	description: string;
	modality: CourseModality;
	access: CourseAccessType;
	/** Solo lo usa el superadministrador; los demás heredan la suya. */
	dependency: string;
	/** Línea del plan de la que nace el curso; vacío si no nace de ninguna. */
	planLine: string;
	capacity: string;
	enrollmentDeadline: string;
	minAttendance: string;
	qrOpensBeforeMinutes: string;
	qrClosesAfterMinutes: string;
	requiresEvaluation: boolean;
	trainers: string[];
	audienceDependencies: string[];
	audienceGroups: string[];
	sessions: CourseSessionFormValues[];
}

/** Fila nueva con TODAS sus claves: un `append({})` deja inputs sin registrar. */
export const emptySessionValues = (): CourseSessionFormValues => ({
	documentId: "",
	date: "",
	startTime: "",
	endTime: "",
	venue: "",
	link: "",
});

/** Las fechas llegan como `Date` o, si algo las serializó, como texto ISO. */
const asDate = (value: Date | string): Date =>
	value instanceof Date ? value : new Date(value);

/** Lo que precarga "Crear curso desde esta línea" (§6.11). */
export interface CoursePlanPrefill {
	lineDocumentId: string;
	title: string;
	plannedModality: CourseModality | null;
}

/**
 * Valores iniciales del formulario.
 *
 * Ningún campo puede quedar `undefined`: react-hook-form nacería con inputs no
 * controlados y `isDirty` dejaría de ser fiable, que es lo que gobierna el aviso
 * de cambios sin guardar.
 *
 * Las horas guardadas en UTC vuelven a la hora de Tijuana aquí, en la frontera,
 * y en ningún otro sitio.
 */
export function buildCourseFormDefaults(
	course?: CourseDetail | null,
	prefill?: CoursePlanPrefill | null,
): CourseFormValues {
	return {
		title: course?.title ?? prefill?.title ?? "",
		description: course?.description ?? "",
		modality: course?.modality ?? prefill?.plannedModality ?? "IN_PERSON",
		access: course?.access ?? "PUBLIC",
		dependency: "",
		planLine: prefill?.lineDocumentId ?? "",
		capacity: course?.capacity?.toString() ?? "",
		enrollmentDeadline: course?.enrollmentDeadline
			? utcToZonedInput(asDate(course.enrollmentDeadline)).date
			: "",
		minAttendance: String(
			course?.minAttendance ?? COURSE_DEFAULTS.minAttendance,
		),
		requiresEvaluation: course?.requiresEvaluation ?? false,
		qrOpensBeforeMinutes: String(
			course?.qrOpensBeforeMinutes ?? COURSE_DEFAULTS.qrOpensBeforeMinutes,
		),
		qrClosesAfterMinutes: String(
			course?.qrClosesAfterMinutes ?? COURSE_DEFAULTS.qrClosesAfterMinutes,
		),
		trainers: course?.trainers.map((trainer) => trainer.userDocumentId) ?? [],
		audienceDependencies:
			course?.audience.dependencies.map((entry) => entry.documentId) ?? [],
		audienceGroups:
			course?.audience.groups.map((entry) => entry.documentId) ?? [],
		sessions:
			course?.sessions.map((session) => {
				const start = utcToZonedInput(asDate(session.startsAt));
				const end = utcToZonedInput(asDate(session.endsAt));

				return {
					documentId: session.documentId,
					date: start.date,
					startTime: start.time,
					endTime: end.time,
					venue: session.venue ?? "",
					link: session.link ?? "",
				};
			}) ?? [],
	};
}
