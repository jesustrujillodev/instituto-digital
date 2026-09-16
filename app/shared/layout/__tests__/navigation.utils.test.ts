import { describe, expect, test } from "vitest";
import type { NavItem } from "../navigation.types";
import { filterNavigationByRole } from "../navigation.utils";

describe("filterNavigationByRole", () => {
	// Sin `roles` el item es visible para cualquier sesión: el layout ya exigió
	// autenticación, así que declarar roles solo hace falta para restringir.
	test("keeps items that declare no roles", () => {
		const items: NavItem[] = [{ label: "Inicio", path: "/dashboard" }];

		expect(filterNavigationByRole(items, "USER")).toEqual(items);
	});

	test("drops an item whose roles exclude the current one", () => {
		const items: NavItem[] = [
			{ label: "Inicio", path: "/dashboard" },
			{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] },
		];

		const result = filterNavigationByRole(items, "USER");

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Inicio");
	});

	test("keeps an item whose roles include the current one", () => {
		const items: NavItem[] = [
			{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] },
		];

		expect(filterNavigationByRole(items, "ADMIN")).toHaveLength(1);
	});

	test("filters children recursively", () => {
		const items: NavItem[] = [
			{
				label: "Administración",
				path: "/admin",
				children: [
					{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] },
					{ label: "Perfil", path: "/perfil" },
				],
			},
		];

		const result = filterNavigationByRole(items, "USER");

		expect(result[0].children).toHaveLength(1);
		expect(result[0].children?.[0].label).toBe("Perfil");
	});

	// El caso que justifica la función: un encabezado sin destino propio que se
	// queda sin hijos sugiere funcionalidad inaccesible. Desaparece entero.
	test("removes a childless GROUP once its children are filtered out", () => {
		const items: NavItem[] = [
			{
				label: "Administración",
				children: [{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] }],
			},
		];

		expect(filterNavigationByRole(items, "USER")).toEqual([]);
	});

	// El otro lado del mismo criterio: si el contenedor SÍ navega a algún sitio,
	// sigue siendo útil aunque pierda todos sus hijos.
	test("keeps a navigable parent even with no visible children left", () => {
		const items: NavItem[] = [
			{
				label: "Administración",
				path: "/admin",
				children: [{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] }],
			},
		];

		const result = filterNavigationByRole(items, "USER");

		expect(result).toHaveLength(1);
		expect(result[0].children).toEqual([]);
	});

	// El propio grupo se descarta antes de mirar a los hijos: un ADMIN-only no se
	// abre porque dentro haya algo público.
	test("a group excluded by role is dropped before its children are inspected", () => {
		const items: NavItem[] = [
			{
				label: "Administración",
				roles: ["ADMIN"],
				children: [{ label: "Perfil", path: "/perfil" }],
			},
		];

		expect(filterNavigationByRole(items, "USER")).toEqual([]);
	});

	test("an empty list stays empty", () => {
		expect(filterNavigationByRole([], "ADMIN")).toEqual([]);
	});
});
