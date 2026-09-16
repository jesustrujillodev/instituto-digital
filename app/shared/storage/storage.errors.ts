// Errores de dominio de storage — agnósticos al framework. Las primitivas de
// storage (transacción/lote) lanzan SOLO estos; el servicio los convierte en el
// envelope estándar y el adaptador de entrada elige la copia de usuario a partir
// del código (mismo patrón que modules/auth/domain/auth.errors.ts).

import { DomainError } from "@/shared/errors/domain-error";

/** Códigos estables — claves del diccionario de copia de quien los consuma. */
export const STORAGE_ERROR_CODES = {
	VALIDATION: "STORAGE_VALIDATION",
	BATCH_FAILED: "STORAGE_BATCH_FAILED",
} as const;

export abstract class StorageError extends DomainError {}

/** Uno o más archivos no pasaron la validación (tipo/tamaño/conteo). */
export class StorageValidationError extends StorageError {
	readonly code = STORAGE_ERROR_CODES.VALIDATION;
	readonly details: { reasons: { name: string; reason: string }[] };

	constructor(readonly reasons: { name: string; reason: string }[]) {
		super(
			`Storage validation failed: ${reasons
				.map((r) => `${r.name} (${r.reason})`)
				.join(", ")}`,
		);
		this.details = { reasons };
	}
}

/**
 * Una o más subidas de un lote fallaron. Con semántica todo-o-nada, las que sí
 * subieron ya se revirtieron; `failures` lista las que fallaron para que el
 * consumidor construya un mensaje ("Error al subir: foto1.png, foto3.png").
 */
export class StorageBatchError extends StorageError {
	readonly code = STORAGE_ERROR_CODES.BATCH_FAILED;
	readonly details: { failures: { name: string; error: string }[] };

	constructor(readonly failures: { name: string; error: string }[]) {
		super(
			`Storage batch upload failed for: ${failures
				.map((f) => f.name)
				.join(", ")}`,
		);
		this.details = { failures };
	}
}
