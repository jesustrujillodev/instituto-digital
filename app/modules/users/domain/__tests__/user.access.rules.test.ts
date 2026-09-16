import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AccessScope } from "@/shared/auth/scope.rules";
import { ROLES, type Role } from "@/shared/rules/atoms.rules";
import {
	assignableRoles,
	canAssignRole,
	canChangeOwnDependency,
	canManageDeputies,
	canManageUser,
	roleAfterDependencyChange,
	scopeWhere,
	scopeWriteWhere,
	USER_MANAGER_ROLES,
} from "../user.access.rules";
import type { SafeUser } from "../user.types";

const actorOf = (
	role: Role,
	dependencyId: number | null = 3,
	userId = 99,
): Pick<AuthContext, "userId" | "role" | "dependencyId"> => ({
	userId,
	role,
	dependencyId,
});

const targetOf = (
	role: Role,
	dependencyId: number | null = 3,
	id = 7,
): Pick<SafeUser, "id" | "role" | "dependencyId"> => ({
	id,
	role,
	dependencyId,
});

describe("scopeWhere", () => {
	test("el alcance global no restringe nada", () => {
		expect(scopeWhere({ kind: "global" })).toEqual({});
	});

	test("el alcance de dependencia filtra por su columna", () => {
		expect(scopeWhere({ kind: "dependency", dependencyId: 42 })).toEqual({
			dependencyId: 42,
		});
	});

	test("el alcance propio filtra por la PK", () => {
		expect(scopeWhere({ kind: "self", userId: 7 })).toEqual({ id: 7 });
	});

	// LA rama que importa: `{}` no filtra nada, así que convertir "no alcanza
	// nada" en "alcanza todo" sería el fallo de aislamiento más grave posible.
	test("el alcance vacío devuelve un predicado imposible, nunca un where vacío", () => {
		const where = scopeWhere({ kind: "none" });

		expect(where).toEqual({ id: { in: [] } });
		expect(where).not.toEqual({});
	});

	// Ninguna variante puede quedarse sin traducir: el `switch` es exhaustivo con
	// comprobación `never`, y esto lo verifica también en ejecución.
	test("toda variante de alcance tiene traducción", () => {
		const scopes: AccessScope[] = [
			{ kind: "global" },
			{ kind: "dependency", dependencyId: 1 },
			{ kind: "self", userId: 1 },
			{ kind: "none" },
		];

		for (const scope of scopes) {
			expect(scopeWhere(scope)).toBeDefined();
		}
	});
});

describe("scopeWriteWhere", () => {
	// Existe aparte porque el `where` de un update exige igualdad sobre la clave
	// única y no admite `IN ()`. No hay predicado imposible que Prisma acepte ahí.
	test("devuelve null para el alcance vacío, no un filtro", () => {
		expect(scopeWriteWhere({ kind: "none" })).toBeNull();
	});

	test("coincide con el filtro de lectura en el resto de alcances", () => {
		expect(scopeWriteWhere({ kind: "global" })).toEqual({});
		expect(scopeWriteWhere({ kind: "dependency", dependencyId: 42 })).toEqual({
			dependencyId: 42,
		});
		expect(scopeWriteWhere({ kind: "self", userId: 7 })).toEqual({ id: 7 });
	});

	// Lo que no puede pasar es que `none` se convierta en `{}`: eso haría que "no
	// alcanza nada" escribiera sobre cualquier fila.
	test("el alcance vacío nunca es un objeto vacío", () => {
		expect(scopeWriteWhere({ kind: "none" })).not.toEqual({});
	});
});

describe("assignableRoles / canAssignRole", () => {
	test("nadie otorga un rol por encima del suyo", () => {
		expect(canAssignRole("DEPENDENCY_DEPUTY", "SUPERADMIN")).toBe(false);
		expect(canAssignRole("DEPENDENCY_HEAD", "SUPERADMIN")).toBe(false);
		expect(canAssignRole("USER", "USER")).toBe(false);
	});

	// Criterio de aceptación 5: el auxiliar da de alta participantes y nada más.
	test("el auxiliar solo otorga el rol base", () => {
		expect(assignableRoles("DEPENDENCY_DEPUTY")).toEqual(["USER"]);
	});

	test("el titular otorga además el de auxiliar", () => {
		expect(canAssignRole("DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY")).toBe(true);
	});

	// La titularidad se designa en la pantalla de la dependencia, en una
	// transacción que degrada al anterior y revoca los tokens de ambos. Otorgarla
	// desde el formulario de usuario se saltaría ese relevo.
	test("DEPENDENCY_HEAD no lo otorga nadie, ni el superadministrador", () => {
		for (const role of ROLES) {
			expect(canAssignRole(role, "DEPENDENCY_HEAD")).toBe(false);
		}
	});

	test("ADMIN conserva lo de la plantilla y no crea superadministradores", () => {
		expect(assignableRoles("ADMIN")).toEqual(["USER", "ADMIN"]);
		expect(canAssignRole("ADMIN", "SUPERADMIN")).toBe(false);
	});

	// Se deriva de lo que puede otorgar en vez de declararse aparte: dos listas
	// que deben coincidir acaban divergiendo.
	test("canManageDeputies se deriva de los roles asignables", () => {
		for (const role of ROLES) {
			expect(canManageDeputies(role)).toBe(
				assignableRoles(role).includes("DEPENDENCY_DEPUTY"),
			);
		}
	});

	test("todo rol de la tupla tiene lista de asignables declarada", () => {
		for (const role of ROLES) {
			expect(assignableRoles(role)).toBeDefined();
		}
	});
});

describe("canManageUser", () => {
	test("el superadministrador administra a cualquiera", () => {
		expect(
			canManageUser(actorOf("SUPERADMIN", null), targetOf("DEPENDENCY_HEAD")),
		).toBe(true);
	});

	// Criterio de aceptación 2, en su versión de rango: el alcance no basta.
	test("el titular no administra fuera de su dependencia", () => {
		expect(
			canManageUser(actorOf("DEPENDENCY_HEAD", 3), targetOf("USER", 9)),
		).toBe(false);
	});

	test("el titular sí administra dentro de la suya", () => {
		expect(
			canManageUser(actorOf("DEPENDENCY_HEAD", 3), targetOf("USER", 3)),
		).toBe(true);
	});

	// Comparten dependencia, así que el alcance lo permitiría: es el rango lo que
	// lo impide. Sin esta comprobación, el auxiliar podría archivar a quien lo
	// administra.
	test("el auxiliar no administra a su titular", () => {
		expect(
			canManageUser(
				actorOf("DEPENDENCY_DEPUTY", 3),
				targetOf("DEPENDENCY_HEAD", 3),
			),
		).toBe(false);
	});

	test("nadie administra a alguien de rango superior", () => {
		expect(
			canManageUser(actorOf("DEPENDENCY_HEAD", 3), targetOf("SUPERADMIN", 3)),
		).toBe(false);
	});

	test("el mismo rango sí se administra", () => {
		expect(
			canManageUser(
				actorOf("DEPENDENCY_HEAD", 3),
				targetOf("DEPENDENCY_HEAD", 3),
			),
		).toBe(true);
	});

	test("un participante solo se administra a sí mismo", () => {
		expect(canManageUser(actorOf("USER", 3, 7), targetOf("USER", 3, 7))).toBe(
			true,
		);
		expect(canManageUser(actorOf("USER", 3, 7), targetOf("USER", 3, 8))).toBe(
			false,
		);
	});

	// Un titular con la fila a medio migrar no administra a nadie, ni siquiera a
	// quien comparte su dependencia nula.
	test("un titular sin dependencia no administra a nadie", () => {
		expect(
			canManageUser(actorOf("DEPENDENCY_HEAD", null), targetOf("USER", null)),
		).toBe(false);
	});
});

describe("canChangeOwnDependency / roleAfterDependencyChange", () => {
	// Regla 6: dejaría su dependencia sin quien la administre.
	test("el titular no puede cambiarse mientras lo sea", () => {
		expect(canChangeOwnDependency("DEPENDENCY_HEAD", "INTERNAL")).toBe(false);
	});

	test("el resto del personal interno sí puede", () => {
		for (const role of ROLES.filter((r) => r !== "DEPENDENCY_HEAD")) {
			expect(canChangeOwnDependency(role, "INTERNAL")).toBe(true);
		}
	});

	// No por su rol —es `USER`, el que sí puede— sino por su tipo: no pertenece a
	// ninguna dependencia y el CHECK `users_type_coherence` le prohíbe tener una.
	test("un externo no puede cambiarse, tenga el rol que tenga", () => {
		for (const role of ROLES) {
			expect(canChangeOwnDependency(role, "EXTERNAL")).toBe(false);
		}
	});

	// Regla 7: auxiliar y titular son cargos DE una dependencia, no atributos de
	// la persona. Las inscripciones y el historial se conservan aparte.
	test("los cargos de dependencia se pierden al salir", () => {
		expect(roleAfterDependencyChange("DEPENDENCY_DEPUTY")).toBe("USER");
		expect(roleAfterDependencyChange("DEPENDENCY_HEAD")).toBe("USER");
	});

	test("los demás roles sobreviven al cambio", () => {
		expect(roleAfterDependencyChange("USER")).toBe("USER");
		expect(roleAfterDependencyChange("SUPERADMIN")).toBe("SUPERADMIN");
		expect(roleAfterDependencyChange("ADMIN")).toBe("ADMIN");
	});
});

describe("USER_MANAGER_ROLES", () => {
	// El participante es el único que no entra: el alcance recorta A QUIÉN
	// administra cada uno, no si puede administrar.
	test("deja fuera solo al participante", () => {
		expect(USER_MANAGER_ROLES).not.toContain("USER");

		for (const role of ROLES.filter((r) => r !== "USER")) {
			expect(USER_MANAGER_ROLES).toContain(role);
		}
	});
});
