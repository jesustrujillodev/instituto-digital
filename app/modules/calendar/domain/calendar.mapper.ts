import type {
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { CalendarSessionRow } from "./calendar.types";

/** La fila tal como la proyecta la consulta del repositorio. */
export interface StoredCalendarSession {
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
	course: {
		documentId: string;
		title: string;
		modality: CourseModality;
		status: CourseStatus;
		dependencyId: number;
		createdById: number;
		dependency: { documentId: string; name: string };
		trainers: {
			userId: number;
			user: {
				documentId: string;
				firstName: string | null;
				lastName: string | null;
				email: string;
			};
		}[];
		enrollments: { status: EnrollmentStatus }[];
		_count: { enrollments: number };
	};
}

export const toCalendarSessionRow = ({
	course,
	...session
}: StoredCalendarSession): CalendarSessionRow => ({
	...session,
	course: {
		documentId: course.documentId,
		title: course.title,
		modality: course.modality,
		status: course.status,
		dependencyId: course.dependencyId,
		createdById: course.createdById,
		dependency: course.dependency,
	},
	trainers: course.trainers.map(({ userId, user }) => ({ userId, ...user })),
	viewerStatus: course.enrollments.at(0)?.status ?? null,
	staffEnrolled: course._count.enrollments > 0,
});
