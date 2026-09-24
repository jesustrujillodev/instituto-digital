import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CERTIFICATE_SIGNATURE_HINT } from "../domain/certificate.config";
import { CERTIFICATE_ERROR_CODES } from "../domain/certificate.errors";

export const CERTIFICATE_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del certificado antes de guardar.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "El curso no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CERTIFICATE_ERROR_CODES.NOT_EDITABLE]: {
		message: "Un curso cancelado ya no cambia de certificado.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CERTIFICATE_ERROR_CODES.NEVER_PUBLISHED]: {
		message: "El certificado todavía no se ha publicado.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CERTIFICATE_ERROR_CODES.SIGNATURE_INVALID]: {
		message: `La imagen de firma no es válida: ${CERTIFICATE_SIGNATURE_HINT}.`,
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.SIGNATURE_NOT_OWNED]: {
		message: "Una de las firmas no se subió a este curso. Vuelve a subirla.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND]: {
		message: "El certificado no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CERTIFICATE_ERROR_CODES.ISSUE_REVOKED]: {
		message:
			"Este certificado se revocó: la persona ya no cumple con lo que pide el curso.",
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
