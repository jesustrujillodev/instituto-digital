import type {
	NotificationEvent,
	NotifiedCourse,
	NotifiedSession,
	OutboxMessage,
	RenderedEmail,
} from "./notification.types";

export const toOutboxMessage = (
	event: NotificationEvent,
	rendered: RenderedEmail,
): OutboxMessage => ({
	template: event.template,
	recipient: event.to.email.trim(),
	...rendered,
});

/** El curso tal como lo cita un aviso. Acepta el detalle de cualquier módulo. */
export const toNotifiedCourse = (course: NotifiedCourse): NotifiedCourse => ({
	documentId: course.documentId,
	title: course.title,
	dependencyName: course.dependencyName,
	modality: course.modality,
});

export const toNotifiedSessions = (
	sessions: readonly NotifiedSession[],
): NotifiedSession[] =>
	sessions.map(({ startsAt, endsAt, venue, link }) => ({
		startsAt,
		endsAt,
		venue,
		link,
	}));
