import { describe, expect, test } from "vitest";
import { FORBIDDEN_ROLE_CODE, HTTP_STATUS } from "@/shared/http/route-error";
import type { Role } from "@/shared/rules/atoms.rules";
import { forbiddenRole } from "../forbidden-role";

const ROLES: readonly Role[] = ["SUPERADMIN", "DEPENDENCY_HEAD"];

describe("forbiddenRole", () => {
	// Es el mismo 403 que lanzaba `requireRole` por dentro. Extraerlo permite que
	// un guard que no decide solo por rol responda EXACTAMENTE lo mismo: dos
	// `data()` escritos aparte divergirían y `isForbiddenRoleError` solo
	// reconocería uno.
	test("lleva el código, los roles exigidos y el status", () => {
		const response = forbiddenRole(ROLES);

		expect(response.data).toEqual({
			code: FORBIDDEN_ROLE_CODE,
			requiredRoles: ROLES,
		});
		expect(response.init?.status).toBe(HTTP_STATUS.FORBIDDEN);
	});

	// Sin él, react-router convierte el `data()` lanzado en un ErrorResponse con
	// "Internal Server Error" y el 403 se mostraría como un error interno.
	test("fija el statusText explícitamente", () => {
		expect(forbiddenRole(ROLES).init?.statusText).toBe("Forbidden");
	});
});
