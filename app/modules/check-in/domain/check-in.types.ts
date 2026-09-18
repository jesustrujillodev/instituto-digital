import type {
	QrCourse,
	QrCourseSession,
} from "@/modules/courses/domain/course.types";
import type { AppResponse } from "@/shared/response/response.types";

// ── Lo que el repositorio lee ─────────────────────────────────────────────────
// Los declara `courses`, dueño de la tabla. Aquí solo se les da el nombre con
// el que los lee este módulo.

export type CheckInSession = QrCourseSession;
export type CheckInCourse = QrCourse;

// ── Lo que ve la pantalla ─────────────────────────────────────────────────────

export interface CheckInCourseView {
	documentId: string;
	title: string;
	dependencyName: string;
}

export interface CheckInSessionView {
	documentId: string;
	/** Posición 1-based dentro del curso: "Sesión 2 de 3". */
	ordinal: number;
	total: number;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
}

export interface CheckInResult {
	/** `ALREADY_RECORDED` conserva el instante del primer escaneo. */
	status: "RECORDED" | "ALREADY_RECORDED";
	course: CheckInCourseView;
	session: CheckInSessionView;
	recordedAt: Date;
}

/**
 * Lo que el loader necesita para pintar la pantalla antes de escribir nada.
 *
 * `canRegister` es lo que dispara el envío automático en el cliente: si es
 * falso, la pantalla ya está mostrando un rechazo.
 */
export interface CheckInPreview {
	canRegister: boolean;
	course: CheckInCourseView;
	session: CheckInSessionView;
}

export interface RotatedQrToken {
	token: string;
	rotatedAt: Date;
}

// ── Envelopes ─────────────────────────────────────────────────────────────────

export type CheckInPreviewResponse = AppResponse<CheckInPreview>;
export type CheckInResponse = AppResponse<CheckInResult>;
export type RotateQrTokenResponse = AppResponse<RotatedQrToken>;
