import type {
	CourseAccessType,
	CourseModality,
	CourseStatus,
} from "../domain/course.rules";

// El vocabulario persistido está en inglés (reglas §24); la copia, aquí.

export const MODALITY_LABELS: Record<CourseModality, string> = {
	IN_PERSON: "Presencial",
	ONLINE: "En línea",
	HYBRID: "Híbrida",
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
