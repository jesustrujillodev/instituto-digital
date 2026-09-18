import type { CourseRoster } from "@/modules/enrollments/domain/enrollment.types";

export interface CourseEnrollmentSummary {
	enrolled: number;
	/** Invitaciones sin responder: todavía pueden convertirse en inscripción. */
	invited: number;
	capacity: number | null;
	seatsLeft: number | null;
	closesAt: Date | null;
	isOpen: boolean;
}

/** Lo que la ficha necesita de la lista de inscritos, sin la lista. */
export const toEnrollmentSummary = ({
	course,
	entries,
}: CourseRoster): CourseEnrollmentSummary => ({
	enrolled: course.enrolledCount,
	invited: entries.filter((entry) => entry.status === "INVITED").length,
	capacity: course.capacity,
	seatsLeft: course.seatsLeft,
	closesAt: course.closesAt,
	isOpen: course.isOpen,
});
