// Errores de dominio del gestor de nube — agnósticos al framework.
// El runner del servicio los convierte en el envelope; la copia de usuario sale
// de utils/cloud-error-messages.ts por código.

import { DomainError } from "@/shared/errors/domain-error";

export const CLOUD_ERROR_CODES = {
	NOT_CONFIGURED: "CLOUD_NOT_CONFIGURED",
	INVALID_CURSOR: "CLOUD_INVALID_CURSOR",
	FOLDER_TOO_LARGE: "CLOUD_FOLDER_TOO_LARGE",
	ZIP_TOO_LARGE: "CLOUD_ZIP_TOO_LARGE",
	NOTHING_SELECTED: "CLOUD_NOTHING_SELECTED",
} as const;

export abstract class CloudError extends DomainError {}

/**
 * No hay bucket configurado.
 *
 * Es un error CONOCIDO y no uno inesperado porque la plantilla arranca sin
 * storage (`STORAGE_PROVIDER` es opcional): la pantalla lo pinta como estado
 * vacío, no como un 500.
 */
export class CloudNotConfiguredError extends CloudError {
	readonly code = CLOUD_ERROR_CODES.NOT_CONFIGURED;
	constructor() {
		super("Storage is not configured");
	}
}

/** El cursor de paginación no es uno emitido por el listado. */
export class InvalidCloudCursorError extends CloudError {
	readonly code = CLOUD_ERROR_CODES.INVALID_CURSOR;
	constructor() {
		super("Invalid listing cursor");
	}
}

/**
 * La selección abarca más objetos de los que una operación admite.
 *
 * Se rechaza ENTERA en vez de procesar los primeros N: borrar media carpeta o
 * descargar un ZIP incompleto sin decirlo es peor que no hacer nada.
 */
export class CloudFolderTooLargeError extends CloudError {
	readonly code = CLOUD_ERROR_CODES.FOLDER_TOO_LARGE;
	readonly details: { maxObjects: number };

	constructor(maxObjects: number) {
		super(`Selection exceeds ${maxObjects} objects`);
		this.details = { maxObjects };
	}
}

export class CloudZipTooLargeError extends CloudError {
	readonly code = CLOUD_ERROR_CODES.ZIP_TOO_LARGE;
	readonly details: { maxBytes: number; totalBytes: number };

	constructor(maxBytes: number, totalBytes: number) {
		super(`Zip of ${totalBytes} bytes exceeds ${maxBytes}`);
		this.details = { maxBytes, totalBytes };
	}
}

/** La selección no contiene ningún objeto existente. */
export class CloudNothingSelectedError extends CloudError {
	readonly code = CLOUD_ERROR_CODES.NOTHING_SELECTED;
	constructor() {
		super("Selection contains no objects");
	}
}
