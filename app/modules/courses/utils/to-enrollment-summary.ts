import type { CourseRosterSummary } from "@/modules/enrollments/domain/enrollment.types";

export interface CourseEnrollmentSummary {
	enrolled: number;
	/** Invitaciones sin responder: todavía pueden convertirse en inscripción. */
	invited: number;
	capacity: number | null;
	seatsLeft: number | null;
	closesAt: Date | null;
	isOpen: boolean;
}

export const toEnrollmentSummary = ({
	course,
	invited,
}: CourseRosterSummary): CourseEnrollmentSummary => ({
	enrolled: course.enrolledCount,
	invited,
	capacity: course.capacity,
	seatsLeft: course.seatsLeft,
	closesAt: course.closesAt,
	isOpen: course.isOpen,
});
