import { describe, expect, test } from "vitest";
import type { AccessScope } from "@/shared/auth/scope.rules";
import {
	canManageGroups,
	groupScopeWhere,
	groupScopeWriteWhere,
	isEffectiveMembership,
} from "../group.access";

const DEPENDENCY: AccessScope = { kind: "dependency", dependencyId: 3 };

describe("groupScopeWhere", () => {
	test("el alcance global no filtra", () => {
		expect(groupScopeWhere({ kind: "global" })).toEqual({});
	});

	test("el de dependencia filtra por ella", () => {
		expect(groupScopeWhere(DEPENDENCY)).toEqual({ dependencyId: 3 });
	});

	// La diferencia es el aislamiento entero: `{}` no filtra nada. Un
	// participante no tiene grupos propios, no es que los vea todos.
	test("`self` y `none` devuelven un predicado imposible, no `{}`", () => {
		expect(groupScopeWhere({ kind: "self", userId: 7 })).toEqual({
			id: { in: [] },
		});
		expect(groupScopeWhere({ kind: "none" })).toEqual({ id: { in: [] } });
	});
});

describe("groupScopeWriteWhere", () => {
	test("`self` y `none` devuelven null para que quien escribe corte antes", () => {
		expect(groupScopeWriteWhere({ kind: "self", userId: 7 })).toBeNull();
		expect(groupScopeWriteWhere({ kind: "none" })).toBeNull();
	});

	test("el de dependencia se funde con la clave única", () => {
		expect(groupScopeWriteWhere(DEPENDENCY)).toEqual({ dependencyId: 3 });
	});
});

describe("canManageGroups", () => {
	// Un grupo pertenece forzosamente a una unidad: un alcance global no sabría a
	// cuál asignarlo y uno propio no administra nada.
	test("solo el alcance de dependencia escribe", () => {
		expect(canManageGroups(DEPENDENCY)).toBe(true);
		expect(canManageGroups({ kind: "global" })).toBe(false);
		expect(canManageGroups({ kind: "self", userId: 7 })).toBe(false);
		expect(canManageGroups({ kind: "none" })).toBe(false);
	});
});

describe("isEffectiveMembership", () => {
	test("cuenta mientras la persona siga en la dependencia del grupo", () => {
		expect(
			isEffectiveMembership({ dependencyId: 3 }, { dependencyId: 3 }),
		).toBe(true);
	});

	// §6.4: quien se traslada sigue en la lista, pero su pertenencia no vale en
	// otra dependencia.
	test("no cuenta tras un traslado ni sin dependencia", () => {
		expect(
			isEffectiveMembership({ dependencyId: 4 }, { dependencyId: 3 }),
		).toBe(false);
		expect(
			isEffectiveMembership({ dependencyId: null }, { dependencyId: 3 }),
		).toBe(false);
	});
});
