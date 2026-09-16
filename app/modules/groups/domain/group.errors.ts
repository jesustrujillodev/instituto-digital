// Errores de dominio del módulo de grupos — agnósticos al framework.

import { DomainError } from "@/shared/errors/domain-error";

export const GROUP_ERROR_CODES = {
	NOT_FOUND: "GROUP_NOT_FOUND",
	DUPLICATE_NAME: "DUPLICATE_GROUP_NAME",
	DEPENDENCY_INACTIVE: "GROUP_DEPENDENCY_INACTIVE",
	MEMBER_OUT_OF_DEPENDENCY: "MEMBER_OUT_OF_DEPENDENCY",
	EXTERNAL_CANNOT_JOIN: "EXTERNAL_CANNOT_JOIN_GROUP",
	MEMBER_ALREADY_IN_GROUP: "MEMBER_ALREADY_IN_GROUP",
	FORBIDDEN_SCOPE: "GROUP_FORBIDDEN_SCOPE",
} as const;

export abstract class GroupError extends DomainError {}

/** No existe, o cae fuera del alcance de quien pregunta. */
export class GroupNotFoundError extends GroupError {
	readonly code = GROUP_ERROR_CODES.NOT_FOUND;
	constructor() {
		super("Group not found");
	}
}

/**
 * Ya hay un grupo activo con ese nombre en la dependencia.
 *
 * La garantía es el índice único parcial `groups_name_per_dependency`; archivar
 * uno libera su nombre.
 */
export class DuplicateGroupNameError extends GroupError {
	readonly code = GROUP_ERROR_CODES.DUPLICATE_NAME;
	constructor() {
		super("Group name already used in this dependency");
	}
}

export class GroupDependencyInactiveError extends GroupError {
	readonly code = GROUP_ERROR_CODES.DEPENDENCY_INACTIVE;
	constructor() {
		super("Dependency is archived");
	}
}

/**
 * El candidato no pertenece a la dependencia DEL GRUPO.
 *
 * Se compara contra la del grupo y no contra la de quien administra: el día que
 * el superadministrador gestione grupos, la segunda abriría el padrón entero.
 */
export class MemberOutOfDependencyError extends GroupError {
	readonly code = GROUP_ERROR_CODES.MEMBER_OUT_OF_DEPENDENCY;
	constructor() {
		super("Member must belong to the group's dependency");
	}
}

/** Un externo no se inscribe ni se agrupa: solo imparte (§4 del alcance). */
export class ExternalCannotJoinGroupError extends GroupError {
	readonly code = GROUP_ERROR_CODES.EXTERNAL_CANNOT_JOIN;
	constructor() {
		super("External accounts cannot join groups");
	}
}

export class MemberAlreadyInGroupError extends GroupError {
	readonly code = GROUP_ERROR_CODES.MEMBER_ALREADY_IN_GROUP;
	constructor() {
		super("Account is already a member of this group");
	}
}

/**
 * El actor puede LEER el grupo pero no escribirlo.
 *
 * Es el caso del superadministrador: la matriz de §3 no le da la administración
 * de grupos, y en PRD-03 sí tendrá que consultarlos para elegir audiencias.
 */
export class GroupForbiddenScopeError extends GroupError {
	readonly code = GROUP_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to modify groups");
	}
}
