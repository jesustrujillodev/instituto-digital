import * as v from "valibot";
import type {
	CourseAccessType,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import { ENROLLMENT_QR_TOKEN_PATTERN } from "./enrollment-qr.config";
import { EnrollmentQrUnavailableError } from "./enrollment-qr.errors";

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const enrollmentQrTokenRule = v.pipe(
	v.string("Falta el código de inscripción."),
	v.regex(
		ENROLLMENT_QR_TOKEN_PATTERN,
		"El código de inscripción no es válido.",
	),
);

export const enrollmentQrCourseRule = v.object({
	documentId: v.pipe(
		v.string("Falta el identificador de la capacitación."),
		v.uuid("El identificador de la capacitación no es válido."),
	),
});

export const enrollmentQrRules = {
	token: enrollmentQrTokenRule,
	course: enrollmentQrCourseRule,
} as const;

// ── Reglas de negocio ─────────────────────────────────────────────────────────

/**
 * Solo un curso publicado al que se entra sin invitación admite el QR.
 *
 * En uno por invitación el escaneo no podría inscribir a nadie que no estuviera
 * invitado, y a quien sí lo está le basta con "Mis cursos". Que la inscripción
 * siga abierta no se exige aquí: un autogestivo se cierra y se reabre, y la
 * ficha a la que llega el escaneo ya dice "inscripción cerrada".
 */
export const acceptsEnrollmentQr = (course: {
	status: CourseStatus;
	access: CourseAccessType;
}): boolean => course.status === "PUBLISHED" && course.access !== "INVITATION";

export function assertAcceptsEnrollmentQr(course: {
	status: CourseStatus;
	access: CourseAccessType;
}): void {
	if (!acceptsEnrollmentQr(course)) throw new EnrollmentQrUnavailableError();
}
