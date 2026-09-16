// Errores de dominio del catálogo de capacitadores — agnósticos al framework.
// Los casos de uso lanzan SOLO estos errores; el runner del servicio los
// convierte en el envelope estándar y el adaptador de entrada elige la copia a
// partir del código.

import { DomainError } from "@/shared/errors/domain-error";

/**
 * Códigos estables del módulo — la clave con la que el adaptador de entrada
 * elige la copia (utils/trainer-error-messages.ts).
 */
export const TRAINER_ERROR_CODES = {
	NOT_FOUND: "TRAINER_PROFILE_NOT_FOUND",
	ALREADY_EXISTS: "TRAINER_PROFILE_ALREADY_EXISTS",
	DUPLICATE_EMAIL: "DUPLICATE_TRAINER_EMAIL",
	EXTERNAL_REQUIRES_INSTITUTION: "EXTERNAL_TRAINER_REQUIRES_INSTITUTION",
	INTERNAL_CANNOT_HAVE_INSTITUTION: "INTERNAL_TRAINER_CANNOT_HAVE_INSTITUTION",
	FORBIDDEN_SCOPE: "TRAINER_FORBIDDEN_SCOPE",
} as const;

export abstract class TrainerError extends DomainError {}

/** No existe el perfil, o la cuenta cae fuera del alcance de quien pregunta. */
export class TrainerProfileNotFoundError extends TrainerError {
	readonly code = TRAINER_ERROR_CODES.NOT_FOUND;
	constructor() {
		super("Trainer profile not found");
	}
}

/**
 * Ya tiene perfil.
 *
 * La comprobación previa da el mensaje; la garantía es que la PK de
 * `trainer_profiles` es la propia FK, así que dos activaciones simultáneas
 * chocan con P2002.
 */
export class TrainerProfileAlreadyExistsError extends TrainerError {
	readonly code = TRAINER_ERROR_CODES.ALREADY_EXISTS;
	constructor() {
		super("User already has a trainer profile");
	}
}

export class DuplicateTrainerEmailError extends TrainerError {
	readonly code = TRAINER_ERROR_CODES.DUPLICATE_EMAIL;
	constructor() {
		super("Email already registered");
	}
}

export class ExternalTrainerRequiresInstitutionError extends TrainerError {
	readonly code = TRAINER_ERROR_CODES.EXTERNAL_REQUIRES_INSTITUTION;
	constructor() {
		super("External trainer requires an institution");
	}
}

/**
 * Un interno pertenece a una dependencia, no a una institución externa. La base
 * no lo impide porque el dato que decide está en otra tabla.
 */
export class InternalTrainerCannotHaveInstitutionError extends TrainerError {
	readonly code = TRAINER_ERROR_CODES.INTERNAL_CANNOT_HAVE_INSTITUTION;
	constructor() {
		super("Internal trainer cannot have an institution");
	}
}

/**
 * El actor alcanza la cuenta pero no tiene rango para administrarla.
 *
 * Se distingue de NOT_FOUND a propósito: cuando el actor ya sabe que la cuenta
 * existe, un 404 le haría buscar un problema que no existe.
 */
export class TrainerForbiddenScopeError extends TrainerError {
	readonly code = TRAINER_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to manage this trainer profile");
	}
}
