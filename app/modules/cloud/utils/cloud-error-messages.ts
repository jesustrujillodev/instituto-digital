import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { STORAGE_ERROR_CODES } from "@/shared/storage/storage.errors";
import { CLOUD_ERROR_CODES } from "../domain/cloud.errors";
import { formatBytes } from "./cloud-format";

const tooLargeCopy = (error: ResponseError) => {
	const max = (error.details as { maxObjects?: number } | undefined)
		?.maxObjects;

	return max
		? `La selección tiene más de ${max.toLocaleString("es-MX")} archivos. Elige carpetas más pequeñas.`
		: "La selección tiene demasiados archivos. Elige carpetas más pequeñas.";
};

const zipTooLargeCopy = (error: ResponseError) => {
	const { maxBytes, totalBytes } =
		(error.details as { maxBytes?: number; totalBytes?: number } | undefined) ??
		{};

	return maxBytes && totalBytes
		? `El ZIP pesaría ${formatBytes(totalBytes)} y el máximo es ${formatBytes(maxBytes)}. Descarga menos carpetas a la vez.`
		: "El ZIP sería demasiado grande. Descarga menos carpetas a la vez.";
};

/**
 * Copia de usuario por código. Mismo contrato que el resto de módulos
 * (docs/reglas.md §25.4): el servicio produce códigos, la copia vive aquí.
 */
export const CLOUD_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Esa carpeta o archivo no tiene una ruta válida.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CLOUD_ERROR_CODES.NOT_CONFIGURED]:
		"El almacenamiento en la nube no está configurado.",
	[CLOUD_ERROR_CODES.INVALID_CURSOR]: {
		message: "La página pedida ya no es válida. Vuelve a abrir la carpeta.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CLOUD_ERROR_CODES.FOLDER_TOO_LARGE]: { message: tooLargeCopy },
	[CLOUD_ERROR_CODES.ZIP_TOO_LARGE]: { message: zipTooLargeCopy },
	[CLOUD_ERROR_CODES.NOTHING_SELECTED]:
		"Los archivos seleccionados ya no existen.",
	[STORAGE_ERROR_CODES.OBJECT_LOCKED]: {
		message:
			"Una de las firmas aparece en certificados ya emitidos y no se puede borrar.",
		status: HTTP_STATUS.CONFLICT,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]:
		"No se pudo completar la operación con el almacenamiento.",
};
