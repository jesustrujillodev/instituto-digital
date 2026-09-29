export {
	QR_TOKEN_BYTES as ENROLLMENT_QR_TOKEN_BYTES,
	QR_TOKEN_PATTERN as ENROLLMENT_QR_TOKEN_PATTERN,
} from "@/modules/check-in/domain/check-in.config";

/** Por IP, igual que el escaneo de asistencia. */
export const ENROLLMENT_QR_RATE_LIMIT = {
	limit: 20,
	windowMs: 60_000,
} as const;

/** La ruta pública que codifica el QR, relativa al origen. */
export const enrollmentQrPathOf = (token: string): string =>
	`/inscripcion/${token}`;

/** A dónde manda el escaneo: la ficha del catálogo, que ya inscribe. */
export const enrollmentLandingPathOf = (courseDocumentId: string): string =>
	`/dashboard/cursos-disponibles/${courseDocumentId}`;
