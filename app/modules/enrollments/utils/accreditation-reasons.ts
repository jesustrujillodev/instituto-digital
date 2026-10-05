import type { AccreditationGap } from "@/modules/teaching/domain/teaching.types";

/** Por qué no acreditaste, dicho a quien cursó la capacitación ya cerrada. */
export const ownGapReasonOf = (gap: AccreditationGap): string => {
	switch (gap.kind) {
		case "ATTENDANCE":
			return `Asististe a ${gap.attended} de ${gap.total} sesiones y se pedía al menos el ${gap.minAttendance} %.`;
		case "CONTENT":
			return "No terminaste las lecciones obligatorias del contenido.";
		case "EXAM_NOT_TAKEN":
			return "No presentaste el examen final.";
		case "GRADE":
			return `Tu calificación fue ${gap.grade} y la mínima era ${gap.minPassingGrade}.`;
		case "GRADE_PENDING":
			return "Tu calificación todavía no se calcula.";
	}
};
