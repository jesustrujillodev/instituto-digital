import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	type BackgroundRejection,
	CERTIFICATE_ERROR_CODES,
} from "../domain/certificate.errors";

const reasonOf = (error: { details?: unknown }) =>
	(error.details as { reason?: string } | undefined)?.reason;

const BACKGROUND_MESSAGES: Record<BackgroundRejection, string> = {
	not_pdf: "El archivo no es un PDF.",
	encrypted: "El PDF está protegido con contraseña. Expórtalo sin protección.",
	unreadable:
		"No se pudo leer el PDF. Vuelve a exportarlo desde tu programa de diseño.",
	too_large: "El PDF pesa más de 10 MB.",
	page_out_of_range:
		"La página del PDF debe medir entre 7 cm y 42 cm por lado (de A7 a A3).",
	raster_mismatch:
		"La vista previa del PDF no coincide con el archivo. Vuelve a subirlo.",
};

export const CERTIFICATE_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del certificado antes de guardar.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "La capacitación no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CERTIFICATE_ERROR_CODES.NOT_EDITABLE]: {
		message: "Una capacitación cancelada ya no cambia de certificado.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CERTIFICATE_ERROR_CODES.NEVER_PUBLISHED]: {
		message: "El certificado todavía no se ha publicado.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CERTIFICATE_ERROR_CODES.ASSET_INVALID]: {
		message: (error) => {
			const reason = reasonOf(error);
			return reason
				? `La imagen no se puede usar: ${reason}.`
				: "La imagen debe ser PNG, JPG, WEBP o SVG de hasta 2 MB.";
		},
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED]: {
		message:
			"Una de las imágenes no se subió a esta capacitación. Vuelve a subirla.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID]: {
		message: (error) =>
			BACKGROUND_MESSAGES[reasonOf(error) as BackgroundRejection] ??
			"El PDF de fondo no se puede usar.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.LOGO_NOT_FOUND]: {
		message: "Uno de los logos ya no existe. Elige otro.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.LOGO_ARCHIVED]: {
		message: "Uno de los logos se archivó. Elige el vigente.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.LOGO_INVALID]: {
		message: (error) => {
			const reason = reasonOf(error);
			return reason
				? `El logo no se puede usar: ${reason}.`
				: "El logo debe ser PNG, WEBP o SVG de hasta 2 MB.";
		},
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.TEMPLATE_NOT_FOUND]: {
		message: "La plantilla no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CERTIFICATE_ERROR_CODES.FORBIDDEN]: {
		message: "No tienes permiso para modificar esto.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND]: {
		message: "El certificado no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CERTIFICATE_ERROR_CODES.ISSUE_REVOKED]: {
		message:
			"Este certificado se revocó: la persona ya no cumple con lo que pide la capacitación.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CERTIFICATE_ERROR_CODES.EXPORT_UNAVAILABLE]: {
		message: "La descarga de certificados no está disponible en este servidor.",
		status: HTTP_STATUS.SERVICE_UNAVAILABLE,
	},
	[CERTIFICATE_ERROR_CODES.EXPORT_FAILED]: {
		message:
			"No se pudo generar el archivo del certificado. Inténtalo de nuevo.",
		status: HTTP_STATUS.BAD_GATEWAY,
	},
	[CERTIFICATE_ERROR_CODES.VERIFY_RATE_LIMITED]: {
		message: (error) => {
			const ms = (error.details as { retryAfterMs?: number } | undefined)
				?.retryAfterMs;
			if (!ms) return "Demasiadas consultas. Intenta de nuevo en un momento.";

			const seconds = Math.ceil(ms / 1000);
			return `Demasiadas consultas. Intenta de nuevo en ${seconds} ${seconds === 1 ? "segundo" : "segundos"}.`;
		},
		status: HTTP_STATUS.TOO_MANY_REQUESTS,
	},
	[CERTIFICATE_ERROR_CODES.DOWNLOAD_DISABLED]: {
		message:
			"La descarga de este certificado no está habilitada: la dependencia organizadora te lo entregará.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: {
		message:
			"No se pudo completar la operación con el certificado. Inténtalo de nuevo.",
		status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
	},
};
