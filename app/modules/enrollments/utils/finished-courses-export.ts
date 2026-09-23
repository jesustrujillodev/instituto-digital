import { utcToZonedInput } from "@/lib/date-utils";
import {
	ACCESS_LABELS,
	MODALITY_LABELS,
	STATUS_LABELS,
} from "@/modules/courses/utils/course-labels";
import type { SpreadsheetSheet } from "@/shared/spreadsheet/spreadsheet.port";
import type {
	EnrollmentCourse,
	EnrollmentCourseSession,
} from "../domain/enrollment.types";

const HOUR_MS = 60 * 60 * 1000;

const hoursOf = (session: EnrollmentCourseSession) =>
	(session.endsAt.getTime() - session.startsAt.getTime()) / HOUR_MS;

/** Cursos: una fila por curso. Sesiones: una fila por sesión de cada curso. */
export const toFinishedCoursesSheets = (
	courses: readonly EnrollmentCourse[],
): SpreadsheetSheet[] => [
	{
		name: "Cursos",
		columns: [
			{ header: "Curso", width: 40 },
			{ header: "Descripción", width: 60 },
			{ header: "Dependencia organizadora", width: 32 },
			{ header: "Estado", width: 12 },
			{ header: "Modalidad", width: 12 },
			{ header: "Acceso", width: 16 },
			{ header: "Cupo", width: 8, format: "integer" },
			{ header: "Inscritos", width: 10, format: "integer" },
			{ header: "Sesiones", width: 10, format: "integer" },
			{ header: "Horas", width: 8, format: "decimal" },
			{ header: "Inicio", width: 18, format: "datetime" },
			{ header: "Fin", width: 18, format: "datetime" },
			{ header: "Finalizado el", width: 14, format: "date" },
		],
		rows: courses.map((course) => [
			course.title,
			course.description,
			course.dependencyName,
			STATUS_LABELS[course.status],
			MODALITY_LABELS[course.modality],
			ACCESS_LABELS[course.access],
			course.capacity,
			course.enrolledCount,
			course.sessions.length,
			course.hours,
			course.firstSessionAt,
			course.lastSessionEndsAt,
			course.finishedAt,
		]),
	},
	{
		name: "Sesiones",
		columns: [
			{ header: "Curso", width: 40 },
			{ header: "Sesión", width: 8, format: "integer" },
			{ header: "Fecha", width: 12, format: "date" },
			{ header: "Inicio", width: 8, format: "time" },
			{ header: "Fin", width: 8, format: "time" },
			{ header: "Horas", width: 8, format: "decimal" },
			{ header: "Sede", width: 32 },
			{ header: "Enlace", width: 40 },
		],
		rows: courses.flatMap((course) =>
			course.sessions.map((session, index) => [
				course.title,
				index + 1,
				session.startsAt,
				session.startsAt,
				session.endsAt,
				hoursOf(session),
				session.venue,
				session.link,
			]),
		),
	},
];

/** `mis-cursos-finalizados-2026-09-19.xlsx`, con la fecha del instituto. */
export const finishedCoursesFileName = (now: Date) =>
	`mis-cursos-finalizados-${utcToZonedInput(now).date}.xlsx`;
