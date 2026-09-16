// Errores de dominio del módulo de usuarios — agnósticos al framework.
// Los casos de uso lanzan SOLO estos errores; el servicio los convierte en el
// envelope estándar (shared/response) y el adaptador de entrada elige la copia
// de usuario a partir del código, igual que hace el módulo de auth.

import { DomainError } from "@/shared/errors/domain-error";

/**
 * Códigos estables del módulo — la clave con la que el adaptador de entrada
 * elige la copia de usuario (utils/user-error-messages.ts).
 *
 * Se declaran aparte de las clases porque el diccionario de mensajes necesita la
 * constante, y un `readonly code` de instancia obligaría a instanciar el error
 * solo para leer su código.
 */
export const USER_ERROR_CODES = {
	NOT_FOUND: "USER_NOT_FOUND",
	DUPLICATE_EMAIL: "DUPLICATE_EMAIL",
	DUPLICATE_EMPLOYEE_NUMBER: "DUPLICATE_EMPLOYEE_NUMBER",
	EMPLOYEE_NUMBER_REQUIRED: "EMPLOYEE_NUMBER_REQUIRED",
	DEPENDENCY_INACTIVE: "USER_DEPENDENCY_INACTIVE",
	DEPENDENCY_NOT_FOUND: "USER_DEPENDENCY_NOT_FOUND",
	HEAD_CANNOT_LEAVE: "HEAD_CANNOT_LEAVE_DEPENDENCY",
	FORBIDDEN_SCOPE: "FORBIDDEN_SCOPE",
	INVALID_CURRENT_PASSWORD: "INVALID_CURRENT_PASSWORD",
	NOT_ARCHIVED: "USER_NOT_ARCHIVED",
	HAS_RELATED_RECORDS: "USER_HAS_RELATED_RECORDS",
	INVALID_UPLOAD: "INVALID_UPLOAD",
	EXTERNAL_REQUIRES_TRAINER: "EXTERNAL_REQUIRES_TRAINER_PROFILE",
} as const;

/**
 * Base del módulo. Extiende DomainError para que `toResponseError` la reconozca
 * como error CONOCIDO y deje viajar su código en el envelope; cualquier error
 * fuera de esta jerarquía se responde como UNEXPECTED_ERROR sin exponer su
 * mensaje.
 */
export abstract class UserError extends DomainError {}

export class UserNotFoundError extends UserError {
	readonly code = USER_ERROR_CODES.NOT_FOUND;
	constructor() {
		super("User not found");
	}
}

export class DuplicateEmailError extends UserError {
	readonly code = USER_ERROR_CODES.DUPLICATE_EMAIL;
	constructor() {
		super("Email already registered");
	}
}

/**
 * El número de empleado ya lo tiene otra cuenta.
 *
 * Existe aparte de DUPLICATE_EMAIL porque son dos índices únicos distintos de la
 * misma tabla y el mismo código de Prisma: el repositorio los separa por
 * `meta.target`. Sin esta distinción, dar de alta a alguien con un número
 * repetido respondía "ese correo ya está registrado".
 */
export class DuplicateEmployeeNumberError extends UserError {
	readonly code = USER_ERROR_CODES.DUPLICATE_EMPLOYEE_NUMBER;
	constructor() {
		super("Employee number already registered");
	}
}

/**
 * Falta el número de empleado en una cuenta interna.
 *
 * La regla de valibot ya lo exige en la frontera; esto cubre la escritura que no
 * pasa por un formulario (una semilla, un script) antes de que el CHECK de la base
 * la rechace con un error sin código de dominio.
 */
export class EmployeeNumberRequiredError extends UserError {
	readonly code = USER_ERROR_CODES.EMPLOYEE_NUMBER_REQUIRED;
	constructor() {
		super("Employee number is required for internal accounts");
	}
}

/** La dependencia destino no existe. */
export class UserDependencyNotFoundError extends UserError {
	readonly code = USER_ERROR_CODES.DEPENDENCY_NOT_FOUND;
	constructor() {
		super("Target dependency not found");
	}
}

/**
 * La dependencia destino está desactivada.
 *
 * Código propio del módulo `users` aunque la copia se parezca a la de
 * `dependencies`: son dos operaciones distintas —dar de alta a alguien contra
 * designar titular— y cada módulo redacta su propio mensaje.
 */
export class UserDependencyInactiveError extends UserError {
	readonly code = USER_ERROR_CODES.DEPENDENCY_INACTIVE;
	constructor() {
		super("Target dependency is archived");
	}
}

/**
 * Un titular intentó cambiarse de dependencia sin ser relevado antes.
 *
 * Dejaría su dependencia sin quien la administre, y el índice único parcial le
 * impediría además ser titular de la nueva si ya tiene uno.
 */
export class HeadCannotLeaveDependencyError extends UserError {
	readonly code = USER_ERROR_CODES.HEAD_CANNOT_LEAVE;
	constructor() {
		super("A dependency head cannot leave before being replaced");
	}
}

/**
 * La acción cae fuera del alcance de quien la pide, y decirlo es lo correcto.
 *
 * Es la excepción a "fuera de alcance se ve igual que inexistente": esa regla
 * protege las LECTURAS, donde un 404 evita confirmar que la cuenta existe. Aquí el
 * actor ya conoce el recurso y lo que intenta es otorgarse o otorgar un privilegio
 * que no tiene; responder "no existe" sería mentirle sobre lo que hizo mal.
 */
export class ForbiddenScopeError extends UserError {
	readonly code = USER_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Action is outside the actor scope");
	}
}

/**
 * La contraseña actual no coincide, en un cambio de autoservicio.
 *
 * A diferencia del login, aquí SÍ se dice cuál es el problema: la sesión ya está
 * autenticada, así que no hay enumeración posible y callarlo solo dejaría a la
 * persona sin saber qué corregir.
 */
export class InvalidCurrentPasswordError extends UserError {
	readonly code = USER_ERROR_CODES.INVALID_CURRENT_PASSWORD;
	constructor() {
		super("Current password does not match");
	}
}

/** Borrado permanente pedido sobre una cuenta que aún está activa. */
export class UserNotArchivedError extends UserError {
	readonly code = USER_ERROR_CODES.NOT_ARCHIVED;
	constructor() {
		super("User must be archived before permanent deletion");
	}
}

/**
 * Borrado permanente bloqueado por una clave foránea.
 *
 * No enumera qué modelos apuntan al usuario a propósito: la restricción la
 * impone la base de datos, así que este módulo no necesita conocer los modelos
 * que se añadan después (`createdBy` y similares).
 */
export class UserHasRelatedRecordsError extends UserError {
	readonly code = USER_ERROR_CODES.HAS_RELATED_RECORDS;
	constructor() {
		super("User has related records");
	}
}

/** El archivo de foto no cumple el tipo o el tamaño permitidos. */
export class InvalidUploadError extends UserError {
	readonly code = USER_ERROR_CODES.INVALID_UPLOAD;
	// `details` viaja dentro del envelope hasta el cliente: el adaptador puede
	// redactar un mensaje concreto sin volver a inspeccionar la clase del error.
	readonly details: { reason: string };

	constructor(reason: string) {
		super(`Invalid upload: ${reason}`);
		this.details = { reason };
	}
}

/**
 * Una cuenta externa no se da de alta desde aquí.
 *
 * §4 del alcance exige que todo externo tenga perfil de capacitador, y esa
 * invariante cruza dos tablas, así que la base no puede imponerla: la sostienen
 * los dos únicos caminos que escriben `type`, y este es el que dice que no.
 */
export class ExternalUserRequiresTrainerProfileError extends UserError {
	readonly code = USER_ERROR_CODES.EXTERNAL_REQUIRES_TRAINER;
	constructor() {
		super("External accounts are created from the trainer catalog");
	}
}
