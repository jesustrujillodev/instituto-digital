import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import { DomainError } from "@/shared/errors/domain-error";

export const CERTIFICATE_ERROR_CODES = {
	COURSE_NOT_FOUND: "CERTIFICATE_COURSE_NOT_FOUND",
	NOT_EDITABLE: "CERTIFICATE_NOT_EDITABLE",
	NEVER_PUBLISHED: "CERTIFICATE_NEVER_PUBLISHED",
	ASSET_INVALID: "CERTIFICATE_ASSET_INVALID",
	ASSET_NOT_OWNED: "CERTIFICATE_ASSET_NOT_OWNED",
	BACKGROUND_INVALID: "CERTIFICATE_BACKGROUND_INVALID",
	LOGO_NOT_FOUND: "CERTIFICATE_LOGO_NOT_FOUND",
	LOGO_ARCHIVED: "CERTIFICATE_LOGO_ARCHIVED",
	LOGO_INVALID: "CERTIFICATE_LOGO_INVALID",
	TEMPLATE_NOT_FOUND: "CERTIFICATE_TEMPLATE_NOT_FOUND",
	FORBIDDEN: "CERTIFICATE_FORBIDDEN",
	ISSUE_NOT_FOUND: "CERTIFICATE_ISSUE_NOT_FOUND",
	ISSUE_REVOKED: "CERTIFICATE_ISSUE_REVOKED",
	EXPORT_UNAVAILABLE: "CERTIFICATE_EXPORT_UNAVAILABLE",
	EXPORT_FAILED: "CERTIFICATE_EXPORT_FAILED",
	VERIFY_RATE_LIMITED: "CERTIFICATE_VERIFY_RATE_LIMITED",
	DOWNLOAD_DISABLED: "CERTIFICATE_DOWNLOAD_DISABLED",
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

/** Una imagen que no es PNG, JPG, WEBP ni un SVG aceptable, o que pesa demasiado. */
export class CertificateAssetInvalidError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.ASSET_INVALID;
	readonly details: { reason: string };
	constructor(reason: string) {
		super(`Certificate image rejected: ${reason}`);
		this.details = { reason };
	}
}

/** El diseño apunta a una imagen o un fondo que no se subió a este curso. */
export class CertificateAssetNotOwnedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED;
	constructor() {
		super("Asset does not belong to this course");
	}
}

export const BACKGROUND_REJECTIONS = [
	"not_pdf",
	"encrypted",
	"unreadable",
	"too_large",
	"page_out_of_range",
	"raster_mismatch",
] as const;
export type BackgroundRejection = (typeof BACKGROUND_REJECTIONS)[number];

/** Un PDF de fondo que no se puede usar: el motivo lo interpola el mensaje. */
export class CertificateBackgroundInvalidError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID;
	readonly details: { reason: BackgroundRejection };
	constructor(reason: BackgroundRejection) {
		super(`Background PDF rejected: ${reason}`);
		this.details = { reason };
	}
}

/** El diseño nombra un logo que no existe. */
export class CertificateLogoNotFoundError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.LOGO_NOT_FOUND;
	constructor() {
		super("Institutional logo not found");
	}
}

/**
 * Un logo archivado sigue pintándose donde ya estaba, pero un diseño nuevo no
 * lo puede elegir.
 */
export class CertificateLogoArchivedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.LOGO_ARCHIVED;
	constructor() {
		super("Institutional logo is archived");
	}
}

export class CertificateLogoInvalidError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.LOGO_INVALID;
	readonly details: { reason: string };
	constructor(reason: string) {
		super(`Institutional logo rejected: ${reason}`);
		this.details = { reason };
	}
}

/** No existe, o quien pregunta no la puede ver: igual que inexistente. */
export class CertificateTemplateNotFoundError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.TEMPLATE_NOT_FOUND;
	constructor() {
		super("Certificate template not found");
	}
}

/**
 * Quien pregunta ve el recurso pero no lo puede administrar: una plantilla de
 * otro alcance, o los logos sin ser de la plataforma.
 */
export class CertificateForbiddenError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.FORBIDDEN;
	constructor() {
		super("Not allowed to manage this certificate resource");
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

/** Demasiadas verificaciones desde la misma IP: el UUID no se prueba a ciegas. */
export class CertificateVerifyRateLimitedError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.VERIFY_RATE_LIMITED;
	readonly details: { retryAfterMs: number };
	constructor(retryAfterMs: number) {
		super("Too many certificate verifications");
		this.details = { retryAfterMs };
	}
}

/** El curso no deja que el participante lo descargue: se lo entrega la dependencia. */
export class CertificateDownloadDisabledError extends CertificateError {
	readonly code = CERTIFICATE_ERROR_CODES.DOWNLOAD_DISABLED;
	constructor() {
		super("Certificate download is disabled for this course");
	}
}
