import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import {
	DuplicateGroupNameError,
	ExternalCannotJoinGroupError,
	GROUP_ERROR_CODES,
	GroupDependencyInactiveError,
	GroupForbiddenScopeError,
	GroupNotFoundError,
	MemberAlreadyInGroupError,
	MemberOutOfDependencyError,
} from "../group.errors";

/**
 * Se comprueba el `code` y NUNCA el `message`: el código es contrato estable y
 * el mensaje es texto traducible de UI.
 */
describe("errores de grupos", () => {
	test("cada error expone su código estable", () => {
		expect(new GroupNotFoundError().code).toBe(GROUP_ERROR_CODES.NOT_FOUND);
		expect(new DuplicateGroupNameError().code).toBe(
			GROUP_ERROR_CODES.DUPLICATE_NAME,
		);
		expect(new GroupDependencyInactiveError().code).toBe(
			GROUP_ERROR_CODES.DEPENDENCY_INACTIVE,
		);
		expect(new MemberOutOfDependencyError().code).toBe(
			GROUP_ERROR_CODES.MEMBER_OUT_OF_DEPENDENCY,
		);
		expect(new ExternalCannotJoinGroupError().code).toBe(
			GROUP_ERROR_CODES.EXTERNAL_CANNOT_JOIN,
		);
		expect(new MemberAlreadyInGroupError().code).toBe(
			GROUP_ERROR_CODES.MEMBER_ALREADY_IN_GROUP,
		);
		expect(new GroupForbiddenScopeError().code).toBe(
			GROUP_ERROR_CODES.FORBIDDEN_SCOPE,
		);
	});

	test("todos descienden de DomainError", () => {
		expect(new GroupNotFoundError()).toBeInstanceOf(DomainError);
		expect(new MemberOutOfDependencyError()).toBeInstanceOf(DomainError);
	});
});
