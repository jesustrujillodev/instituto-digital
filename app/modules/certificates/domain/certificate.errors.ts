import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import { DomainError } from "@/shared/errors/domain-error";

export const CERTIFICATE_ERROR_CODES = {
	COURSE_NOT_FOUND: "CERTIFICATE_COURSE_NOT_FOUND",
	NOT_EDITABLE: "CERTIFICATE_NOT_EDITABLE",
	NEVER_PUBLISHED: "CERTIFICATE_NEVER_PUBLISHED",
	SIGNATURE_INVALID: "CERTIFICATE_SIGNATURE_INVALID",
	SIGNATURE_NOT_OWNED: "CERTIFICATE_SIGNATURE_NOT_OWNED",
	ISSUE_NOT_FOUND: "CERTIFICATE_ISSUE_NOT_FOUND",
	ISSUE_REVOKED: "CERTIFICATE_ISSUE_REVOKED",
	EXPORT_UNAVAILABLE: "CERTIFICATE_EXPORT_UNAVAILABLE",
	EXPORT_FAILED: "CERTIFICATE_EXPORT_FAILED",
} as const;

export abstract class CertificateError extends DomainError {}

/** No existe, o quien pregunta no administra el curso. */
export class CertificateCourseNotFoundError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

/** Un curso cancelado ya no cambia de certificado. */
export class CertificateNotEditableError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.NOT_EDITABLE;
	readonly details: { status: CourseStatus };
	constructor(status: CourseStatus) {
		super("Certificate is no longer editable");
		this.details = { status };
	}
}

/** Descartar cambios pide un publicado al que volver. */
export class CertificateNeverPublishedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.NEVER_PUBLISHED;
	constructor() {
		super("Certificate was never published");
	}
}

export class CertificateSignatureInvalidError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.SIGNATURE_INVALID;
	readonly details: { reason: string };
	constructor(reason: string) {
		super(`Signature image rejected: ${reason}`);
		this.details = { reason };
	}
}

/** El diseño apunta a una imagen que no es una firma subida a este curso. */
export class CertificateSignatureNotOwnedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.SIGNATURE_NOT_OWNED;
	constructor() {
		super("Signature does not belong to this course");
	}
}

/** No existe, o quien pregunta no ve el curso en impartición. */
export class CertificateIssueNotFoundError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND;
	constructor() {
		super("Certificate issue not found");
	}
}

/** Quien lo recibió dejó de completar el curso. */
export class CertificateIssueRevokedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.ISSUE_REVOKED;
	constructor() {
		super("Certificate issue was revoked");
	}
}

/** El servidor no tiene con qué exportar: falta `CHROMIUM_PATH`. */
export class CertificateExportUnavailableError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.EXPORT_UNAVAILABLE;
	constructor() {
		super("Certificate export is not configured");
	}
}

/**
 * El navegador no terminó el archivo, o faltó un recurso del documento. Nunca
 * se entrega un certificado a medias, por ejemplo sin una de sus firmas.
 */
export class CertificateExportFailedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.EXPORT_FAILED;
	readonly details: { reason: string };
	constructor(reason: string) {
		super(`Certificate export failed: ${reason}`);
		this.details = { reason };
	}
}
