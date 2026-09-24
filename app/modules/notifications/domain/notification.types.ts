import type { CourseModality } from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";

export interface Recipient {
	email: string;
	firstName: string | null;
	lastName: string | null;
}

export interface NotifiedCourse {
	documentId: string;
	title: string;
	dependencyName: string;
	modality: CourseModality;
}

export interface NotifiedSession {
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
}

/**
 * Lo que pasó, con los datos que el correo necesita. Quien avisa arma el evento
 * con lo que ya tiene en mano: la plantilla no vuelve a leer la base.
 */
export type NotificationEvent =
	| { template: "ACCOUNT_CREATED"; to: Recipient }
	| { template: "PASSWORD_RESET"; to: Recipient }
	| {
			template: "DEPENDENCY_CHANGED";
			to: Recipient;
			fromDependency: string | null;
			toDependency: string;
	  }
	| {
			template:
				| "COURSE_INVITATION"
				| "ENROLLMENT_CONFIRMED"
				| "ENROLLMENT_ASSIGNED"
				| "COURSE_UPDATED";
			to: Recipient;
			course: NotifiedCourse;
			sessions: readonly NotifiedSession[];
	  }
	| { template: "COURSE_CANCELLED"; to: Recipient; course: NotifiedCourse }
	| {
			template: "CERTIFICATE_ISSUED";
			to: Recipient;
			course: { title: string; dependencyName: string };
			folio: string;
			/** Con la descarga apagada, el correo dice quién lo entrega. */
			downloadable: boolean;
			/** El mensaje que el curso configuró para este correo. */
			message: string | null;
	  };

export interface RenderedEmail {
	subject: string;
	text: string;
	html: string;
}

export interface OutboxMessage extends RenderedEmail {
	template: NotificationEvent["template"];
	recipient: string;
}

export interface ClaimedMessage extends RenderedEmail {
	id: number;
	recipient: string;
	/** Ya contando el intento que se va a hacer. */
	attempts: number;
}

export interface DrainSummary {
	sent: number;
	retried: number;
	failed: number;
	purged: number;
}

export type NotifyResponse = AppResponse<{ queued: number }>;
