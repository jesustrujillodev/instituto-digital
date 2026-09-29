import type {
	EnrollmentQrCourse,
	EnrollmentQrState,
} from "@/modules/courses/domain/course.types";
import type { AppResponse } from "@/shared/response/response.types";

// Los declara `courses`, dueño de la tabla; aquí solo se les da nombre.
export type { EnrollmentQrCourse, EnrollmentQrState };

/** A qué curso lleva el escaneo, ya comprobado para quien escanea. */
export interface ResolvedEnrollmentQr {
	courseDocumentId: string;
}

/** Lo que pinta el panel de la ficha de administración. */
export interface EnrollmentQrPanel extends EnrollmentQrState {
	/** Falso con la inscripción cerrada hoy: el impreso llevará a "cerrada". */
	enrollmentOpen: boolean;
}

export interface RotatedEnrollmentQrToken {
	token: string;
	rotatedAt: Date;
}

export type ResolveEnrollmentQrResponse = AppResponse<ResolvedEnrollmentQr>;
export type EnrollmentQrPanelResponse = AppResponse<EnrollmentQrPanel>;
export type RotateEnrollmentQrTokenResponse =
	AppResponse<RotatedEnrollmentQrToken>;
