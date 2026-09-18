import type {
	CheckInCourse,
	CheckInCourseView,
	CheckInPreview,
	CheckInResult,
	CheckInSession,
	CheckInSessionView,
} from "./check-in.types";

export const toCheckInCourseView = (
	course: CheckInCourse,
): CheckInCourseView => ({
	documentId: course.documentId,
	title: course.title,
	dependencyName: course.dependencyName,
});

/**
 * El ordinal sale de la posición en el curso, no de un campo: las sesiones se
 * leen ya ordenadas por `startsAt` y renumerarlas al editar sería una columna
 * más que mantener sincronizada.
 */
export const toCheckInSessionView = (
	course: CheckInCourse,
	session: CheckInSession,
): CheckInSessionView => ({
	documentId: session.documentId,
	ordinal: course.sessions.findIndex((row) => row.id === session.id) + 1,
	total: course.sessions.length,
	startsAt: session.startsAt,
	endsAt: session.endsAt,
	venue: session.venue,
});

export const toCheckInResult = (
	course: CheckInCourse,
	session: CheckInSession,
	written: boolean,
	at: Date,
): CheckInResult => ({
	status: written ? "RECORDED" : "ALREADY_RECORDED",
	course: toCheckInCourseView(course),
	session: toCheckInSessionView(course, session),
	recordedAt: at,
});

export const toCheckInPreview = (
	course: CheckInCourse,
	session: CheckInSession,
): CheckInPreview => ({
	canRegister: true,
	course: toCheckInCourseView(course),
	session: toCheckInSessionView(course, session),
});
