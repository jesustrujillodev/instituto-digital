import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { Role } from "@/shared/rules/atoms.rules";
import { resolveScope } from "../scope.rules";

const authOf = (role: Role, dependencyId: number | null = 3): AuthContext => ({
	userId: 7,
	documentId: "11111111-1111-4111-8111-111111111111",
	email: "ana@empresa.com",
	role,
	dependencyId,
});

describe("resolveScope", () => {
	// El superadministrador administra a cualquiera: su alcance no depende de su
	// dependencia, y de hecho no tiene ninguna.
	test("el superadministrador tiene alcance global", () => {
		expect(resolveScope(authOf("SUPERADMIN", null))).toEqual({
			kind: "global",
		});
	});

	// ADMIN conserva el alcance de la plantilla, donde es quien administra a todo
	// el mundo. Ninguna cuenta del instituto lo usa.
	test("ADMIN conserva el alcance global de la plantilla", () => {
		expect(resolveScope(authOf("ADMIN", null))).toEqual({ kind: "global" });
	});

	test("el titular y el auxiliar quedan acotados a su dependencia", () => {
		for (const role of ["DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY"] as const) {
			expect(resolveScope(authOf(role, 42))).toEqual({
				kind: "dependency",
				dependencyId: 42,
			});
		}
	});

	// ES LA RAMA QUE IMPORTA. Un titular cuya fila quedara sin dependencia —una
	// migración a medias, una escritura manual— no puede caer en "sin filtro": eso
	// le daría acceso a todas las dependencias justo por tener el dato incompleto.
	test("un titular sin dependencia no ve nada, no lo ve todo", () => {
		expect(resolveScope(authOf("DEPENDENCY_HEAD", null))).toEqual({
			kind: "none",
		});
		expect(resolveScope(authOf("DEPENDENCY_DEPUTY", null))).toEqual({
			kind: "none",
		});
	});

	test("un participante solo se alcanza a sí mismo", () => {
		expect(resolveScope(authOf("USER"))).toEqual({ kind: "self", userId: 7 });
	});

	// El alcance se deriva del claim y de nada más: cambiar la dependencia del
	// token es lo único que mueve lo que alguien ve, y eso exige volver a firmar.
	test("el alcance de un participante ignora su dependencia", () => {
		expect(resolveScope(authOf("USER", 99))).toEqual({
			kind: "self",
			userId: 7,
		});
	});

	// Ningún rol se resuelve a `global` por descarte: es lo que hace seguro añadir
	// roles a la tupla, porque el `switch` exhaustivo rompe en compilación.
	test("ningún rol de la tupla cae en global sin declararlo", () => {
		const globales = (["USER", "DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY"] as const)
			.map((role) => resolveScope(authOf(role)))
			.filter((scope) => scope.kind === "global");

		expect(globales).toEqual([]);
	});
});
