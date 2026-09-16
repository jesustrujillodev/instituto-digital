// Errores de dominio del módulo de dependencias — agnósticos al framework.
// Los casos de uso lanzan SOLO estos errores; el runner del servicio los
// convierte en el envelope estándar y el adaptador de entrada elige la copia de
// usuario a partir del código, igual que hacen auth y users.

import { DomainError } from "@/shared/errors/domain-error";

/**
 * Códigos estables del módulo — la clave con la que el adaptador de entrada
 * elige la copia (utils/dependency-error-messages.ts).
 *
 * Se declaran aparte de las clases porque el diccionario de mensajes necesita la
 * constante, y un `readonly code` de instancia obligaría a instanciar el error
 * solo para leer su código.
 */
export const DEPENDENCY_ERROR_CODES = {
	NOT_FOUND: "DEPENDENCY_NOT_FOUND",
	DUPLICATE_NAME: "DUPLICATE_DEPENDENCY_NAME",
	INACTIVE: "DEPENDENCY_INACTIVE",
	ALREADY_HAS_HEAD: "DEPENDENCY_ALREADY_HAS_HEAD",
	HEAD_MUST_BELONG: "HEAD_MUST_BELONG_TO_DEPENDENCY",
	HEAD_MUST_BE_ACTIVE: "HEAD_MUST_BE_ACTIVE",
} as const;

/**
 * Base del módulo. Extiende DomainError para que `toResponseError` la reconozca
 * como error CONOCIDO y deje viajar su código en el envelope; cualquier error
 * fuera de esta jerarquía se responde como UNEXPECTED_ERROR sin exponer su
 * mensaje.
 */
export abstract class DependencyError extends DomainError {}

export class DependencyNotFoundError extends DependencyError {
	readonly code = DEPENDENCY_ERROR_CODES.NOT_FOUND;
	constructor() {
		super("Dependency not found");
	}
}

export class DuplicateDependencyNameError extends DependencyError {
	readonly code = DEPENDENCY_ERROR_CODES.DUPLICATE_NAME;
	constructor() {
		super("Dependency name already registered");
	}
}

/**
 * Está desactivada y la operación pedida exige que esté activa: una dependencia
 * archivada no admite personal nuevo ni titular, pero conserva su historial.
 */
export class DependencyInactiveError extends DependencyError {
	readonly code = DEPENDENCY_ERROR_CODES.INACTIVE;
	constructor() {
		super("Dependency is archived");
	}
}

/**
 * Ya tiene titular activo.
 *
 * En condiciones normales `assignHead` degrada al anterior y nunca llega aquí.
 * Existe para cuando la base rechaza la escritura por el índice único parcial
 * `users_one_head_per_dependency` —dos designaciones simultáneas—, que es la
 * garantía real de la invariante: la comprobación de la aplicación es una
 * cortesía, el índice es la regla.
 */
export class DependencyAlreadyHasHeadError extends DependencyError {
	readonly code = DEPENDENCY_ERROR_CODES.ALREADY_HAS_HEAD;
	constructor() {
		super("Dependency already has an active head");
	}
}

/** El candidato a titular no está adscrito a la dependencia que administraría. */
export class HeadMustBelongToDependencyError extends DependencyError {
	readonly code = DEPENDENCY_ERROR_CODES.HEAD_MUST_BELONG;
	constructor() {
		super("Head candidate must belong to the dependency");
	}
}

/**
 * El candidato está archivado.
 *
 * Se distingue de HEAD_MUST_BELONG porque el índice único parcial solo cuenta
 * titulares no archivados: promover una cuenta archivada NO violaría la base y
 * dejaría la dependencia con un titular que no puede iniciar sesión.
 */
export class HeadMustBeActiveError extends DependencyError {
	readonly code = DEPENDENCY_ERROR_CODES.HEAD_MUST_BE_ACTIVE;
	constructor() {
		super("Head candidate must be an active account");
	}
}
