import {
	countsAttendance,
	countsContent,
} from "@/modules/courses/domain/course.rules";
import type {
	AccreditationGap,
	TeachingDetail,
	TeachingParticipantView,
} from "../domain/teaching.types";

export type RequirementState = "met" | "unmet" | "pending";

export interface RequirementStatus {
	key: "attendance" | "content" | "grade";
	label: string;
	state: RequirementState;
}

const hasGap = (
	gaps: readonly AccreditationGap[],
	...kinds: AccreditationGap["kind"][]
) => gaps.some((gap) => kinds.includes(gap.kind));

const gradeRequirementOf = (
	minPassingGrade: number,
	participant: Pick<TeachingParticipantView, "grade" | "gaps">,
): RequirementStatus => {
	const { gaps, grade } = participant;
	if (hasGap(gaps, "EXAM_NOT_TAKEN")) {
		return {
			key: "grade",
			label: "Examen final sin presentar",
			state: "unmet",
		};
	}
	if (grade === null) {
		return {
			key: "grade",
			label: `Calificación pendiente (mínima ${minPassingGrade})`,
			state: "pending",
		};
	}
	return {
		key: "grade",
		label: `Calificación ${grade} (mínima ${minPassingGrade})`,
		state: hasGap(gaps, "GRADE") ? "unmet" : "met",
	};
};

/**
 * Cada requisito que pide el curso con el valor de la persona junto a su
 * mínimo. El estado sale de `gaps`, que es lo mismo que decide si acredita.
 */
export const requirementsOf = (
	course: Pick<
		TeachingDetail["course"],
		"completionRule" | "minAttendance" | "minPassingGrade"
	>,
	participant: Pick<
		TeachingParticipantView,
		"attendancePercent" | "progressPercent" | "grade" | "gaps"
	>,
	graded: boolean,
): RequirementStatus[] => [
	...(countsAttendance(course.completionRule)
		? [
				{
					key: "attendance" as const,
					label: `Asistencia ${participant.attendancePercent} % (mínimo ${course.minAttendance} %)`,
					state: hasGap(participant.gaps, "ATTENDANCE")
						? ("unmet" as const)
						: ("met" as const),
				},
			]
		: []),
	...(countsContent(course.completionRule)
		? [
				{
					key: "content" as const,
					label: `Contenido ${participant.progressPercent} %`,
					state: hasGap(participant.gaps, "CONTENT")
						? ("unmet" as const)
						: ("met" as const),
				},
			]
		: []),
	...(graded ? [gradeRequirementOf(course.minPassingGrade, participant)] : []),
];

/** Por qué alguien no acredita, para quien imparte. */
export const gapReasonOf = (gap: AccreditationGap): string => {
	switch (gap.kind) {
		case "ATTENDANCE":
			return `Asistió a ${gap.attended} de ${gap.total} sesiones; se pide al menos el ${gap.minAttendance} %.`;
		case "CONTENT":
			return "Le falta terminar las lecciones obligatorias del contenido.";
		case "EXAM_NOT_TAKEN":
			return "No presentó el examen final.";
		case "GRADE":
			return `Su calificación es ${gap.grade}; se pide ${gap.minPassingGrade} o más.`;
		case "GRADE_PENDING":
			return "Su calificación todavía no se calcula.";
	}
};
