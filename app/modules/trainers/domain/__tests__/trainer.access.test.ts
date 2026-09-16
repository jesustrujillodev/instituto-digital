import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { SafeUser } from "@/modules/users/domain/user.types";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	canAdministerTrainers,
	canManageTrainer,
	canViewCatalog,
} from "../trainer.access";

const authOf = (
	role: Role,
	isTrainer = false,
	dependencyId: number | null = 3,
): Pick<AuthContext, "userId" | "role" | "dependencyId" | "isTrainer"> => ({
	userId: 7,
	role,
	dependencyId,
	isTrainer,
});

const targetOf = (
	overrides: Partial<
		Pick<SafeUser, "id" | "role" | "dependencyId" | "type">
	> = {},
) => ({
	id: 9,
	role: "USER" as Role,
	dependencyId: 3,
	type: "INTERNAL" as const,
	...overrides,
});

describe("canViewCatalog", () => {
	test("los roles de gestión entran siempre", () => {
		for (const role of [
			"SUPERADMIN",
			"ADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(canViewCatalog(authOf(role))).toBe(true);
		}
	});

	// Es la condición que `requireRole` no sabe expresar y por la que existe
	// `forbiddenRole`: §3 del alcance deja consultar el catálogo a cualquier
	// capacitador, tenga el rol que tenga.
	test("un participante CON perfil de capacitador entra", () => {
		expect(canViewCatalog(authOf("USER", true))).toBe(true);
	});

	test("un participante sin perfil no entra", () => {
		expect(canViewCatalog(authOf("USER", false))).toBe(false);
	});
});

describe("canAdministerTrainers", () => {
	test("ver el catálogo y modificarlo son permisos distintos", () => {
		expect(canAdministerTrainers("USER")).toBe(false);
		expect(canAdministerTrainers("DEPENDENCY_DEPUTY")).toBe(true);
	});
});

describe("canManageTrainer", () => {
	test("un titular administra a su gente", () => {
		expect(canManageTrainer(authOf("DEPENDENCY_HEAD"), targetOf())).toBe(true);
	});

	test("un titular no administra a alguien de otra dependencia", () => {
		expect(
			canManageTrainer(
				authOf("DEPENDENCY_HEAD"),
				targetOf({ dependencyId: 7 }),
			),
		).toBe(false);
	});

	// Un externo no pertenece a ninguna dependencia, así que el alcance no lo
	// alcanzaría nunca; ahí manda el rol, que es lo que dice la matriz de §3 al
	// no acotar esa fila a "su dep.".
	test("un titular sí administra a un externo", () => {
		expect(
			canManageTrainer(
				authOf("DEPENDENCY_HEAD"),
				targetOf({ dependencyId: null, type: "EXTERNAL" }),
			),
		).toBe(true);
	});

	test("un participante no administra a nadie, ni siquiera a un externo", () => {
		expect(
			canManageTrainer(
				authOf("USER", true),
				targetOf({ dependencyId: null, type: "EXTERNAL" }),
			),
		).toBe(false);
	});

	test("nadie administra a alguien de rango superior", () => {
		expect(
			canManageTrainer(
				authOf("DEPENDENCY_DEPUTY"),
				targetOf({ role: "DEPENDENCY_HEAD" }),
			),
		).toBe(false);
	});
});
