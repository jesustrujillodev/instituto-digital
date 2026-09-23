import {
	type CourseAccessType,
	type CourseCompletionRule,
	type CourseFormat,
	type CourseModality,
	type CourseStatus,
	courseHoursOf,
	type EvaluationMethod,
	type PublishCheck,
} from "../domain/course.rules";

// El vocabulario persistido está en inglés (reglas §24); la copia, aquí.

export const MODALITY_LABELS: Record<CourseModality, string> = {
	IN_PERSON: "Presencial",
	ONLINE: "En línea",
	HYBRID: "Híbrida",
};

export const FORMAT_LABELS: Record<CourseFormat, string> = {
	SCHEDULED: "Calendarizado",
	SELF_PACED: "Autogestivo",
};

export const COMPLETION_RULE_LABELS: Record<CourseCompletionRule, string> = {
	ATTENDANCE: "Asistencia",
	CONTENT: "Contenido",
	BOTH: "Asistencia y contenido",
};

export const EVALUATION_METHOD_LABELS: Record<EvaluationMethod, string> = {
	MANUAL: "Captura manual",
	QUIZ: "Examen en línea",
};

export const ACCESS_LABELS: Record<CourseAccessType, string> = {
	PUBLIC: "Público",
	RESTRICTED: "Restringido",
	INVITATION: "Por invitación",
};

export const STATUS_LABELS: Record<CourseStatus, string> = {
	DRAFT: "Borrador",
	PUBLISHED: "Publicado",
	FINISHED: "Finalizado",
	CANCELLED: "Cancelado",
};

const hoursFormat = new Intl.NumberFormat("es-MX", {
	maximumFractionDigits: 1,
});

/** "20 h", o "7.5 h" cuando salen de la duración de las sesiones. */
export const formatHours = (hours: number): string =>
	`${hoursFormat.format(hours)} h`;

/** La duración para quien administra el curso: dice si se capturó o se dedujo. */
export const courseHoursLabel = (course: {
	hours: number | null;
	sessions: readonly { startsAt: Date | string; endsAt: Date | string }[];
}): string => {
	const hours = courseHoursOf({
		hours: course.hours,
		sessions: course.sessions.map((session) => ({
			startsAt: new Date(session.startsAt),
			endsAt: new Date(session.endsAt),
		})),
	});

	if (hours === null) return "Sin capturar";
	return course.hours === null
		? `${formatHours(hours)}, según sus sesiones`
		: formatHours(hours);
};

const PLACE_LABELS: Record<CourseModality, string> = {
	IN_PERSON: "Sede en cada sesión",
	ONLINE: "Enlace en cada sesión",
	HYBRID: "Sede y enlace en cada sesión",
};

export const publishCheckLabel = (
	check: PublishCheck,
	modality: CourseModality,
): string => {
	switch (check) {
		case "sessions":
			return "Al menos una sesión";
		case "places":
			return PLACE_LABELS[modality];
		case "trainer":
			return "Un capacitador activo";
		case "audience":
			return "Dependencias o grupos que lo verán";
		case "quiz":
			return "Un examen con al menos una pregunta";
		case "content":
			return "Al menos una lección";
	}
};
