import { DomainError } from "@/shared/errors/domain-error";

export const CREDIT_ERROR_CODES = {
	FORBIDDEN_SCOPE: "CREDIT_FORBIDDEN_SCOPE",
	DEPENDENCY_NOT_FOUND: "CREDIT_DEPENDENCY_NOT_FOUND",
} as const;

export abstract class CreditError extends DomainError {}

/** Participante y capacitador solo ven sus propios créditos (§3). */
export class CreditForbiddenScopeError extends CreditError {
	readonly code = CREDIT_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to read credits of other people");
	}
}

export class CreditDependencyNotFoundError extends CreditError {
	readonly code = CREDIT_ERROR_CODES.DEPENDENCY_NOT_FOUND;
	constructor() {
		super("Dependency not found");
	}
}
