import type {
	CourseAccessType,
	CourseCompletionRule,
	CourseFormat,
	CourseModality,
	CourseStatus,
	PublishCheck,
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
		case "content":
			return "Al menos una lección";
	}
};
