import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import type { NavItem, NavSection } from "../navigation.types";
import {
	filterNavigationByRole,
	filterNavigationSections,
} from "../navigation.utils";

/** Quien navega. Por defecto, sin perfil de capacitador. */
const viewerOf = (role: Role, isTrainer = false) => ({ role, isTrainer });

describe("filterNavigationByRole", () => {
	// Sin `roles` el item es visible para cualquier sesión: el layout ya exigió
	// autenticación, así que declarar roles solo hace falta para restringir.
	test("keeps items that declare no roles", () => {
		const items: NavItem[] = [{ label: "Inicio", path: "/dashboard" }];

		expect(filterNavigationByRole(items, viewerOf("USER"))).toEqual(items);
	});

	test("drops an item whose roles exclude the current one", () => {
		const items: NavItem[] = [
			{ label: "Inicio", path: "/dashboard" },
			{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] },
		];

		const result = filterNavigationByRole(items, viewerOf("USER"));

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Inicio");
	});

	test("keeps an item whose roles include the current one", () => {
		const items: NavItem[] = [
			{ label: "Usuarios", path: "/usuarios", roles: ["ADMIN"] },
		];

		expect(filterNavigationByRole(items, viewerOf("ADMIN"))).toHaveLength(1);
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

		const result = filterNavigationByRole(items, viewerOf("USER"));

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

		expect(filterNavigationByRole(items, viewerOf("USER"))).toEqual([]);
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

		const result = filterNavigationByRole(items, viewerOf("USER"));

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

		expect(filterNavigationByRole(items, viewerOf("USER"))).toEqual([]);
	});

	// Es la condición que `roles` no sabe expresar: el catálogo de capacitadores
	// lo consulta cualquiera con perfil, tenga el rol que tenga (§3 del alcance).
	test("un item marcado `trainer` lo ve un participante con perfil", () => {
		const items: NavItem[] = [
			{
				label: "Capacitadores",
				path: "/capacitadores",
				roles: ["SUPERADMIN"],
				trainer: true,
			},
		];

		expect(filterNavigationByRole(items, viewerOf("USER", true))).toEqual(
			items,
		);
		expect(filterNavigationByRole(items, viewerOf("USER", false))).toEqual([]);
	});

	// Las dos condiciones se SUMAN: marcar `trainer` no le quita el item a quien
	// ya lo tenía por su rol.
	test("`trainer` no reemplaza a los roles declarados", () => {
		const items: NavItem[] = [
			{
				label: "Capacitadores",
				path: "/capacitadores",
				roles: ["SUPERADMIN"],
				trainer: true,
			},
		];

		expect(filterNavigationByRole(items, viewerOf("SUPERADMIN"))).toEqual(
			items,
		);
	});

	test("an empty list stays empty", () => {
		expect(filterNavigationByRole([], viewerOf("ADMIN"))).toEqual([]);
	});
});

describe("filterNavigationSections", () => {
	test("drops a section whose roles exclude the viewer", () => {
		const sections: NavSection[] = [
			{
				label: "Administración",
				roles: ["ADMIN"],
				items: [{ label: "Nube", path: "/nube" }],
			},
		];

		expect(filterNavigationSections(sections, viewerOf("USER"))).toEqual([]);
	});

	// Una etiqueta sin destinos debajo sugiere funcionalidad inaccesible.
	test("drops a section left without visible items", () => {
		const sections: NavSection[] = [
			{
				label: "Gestión",
				items: [{ label: "Grupos", path: "/grupos", roles: ["ADMIN"] }],
			},
		];

		expect(filterNavigationSections(sections, viewerOf("USER"))).toEqual([]);
	});

	test("keeps only the visible items of a section", () => {
		const sections: NavSection[] = [
			{
				label: "Gestión",
				items: [
					{ label: "Cursos", path: "/cursos", trainer: true, roles: ["ADMIN"] },
					{ label: "Grupos", path: "/grupos", roles: ["ADMIN"] },
				],
			},
		];

		const result = filterNavigationSections(sections, viewerOf("USER", true));

		expect(result).toHaveLength(1);
		expect(result[0].items.map((item) => item.label)).toEqual(["Cursos"]);
	});

	// `trainer` abre items, nunca secciones: un capacitador con rol de plataforma
	// no hereda el bloque de gestión de dependencia.
	test("being a trainer does not open a section excluded by role", () => {
		const sections: NavSection[] = [
			{
				label: "Gestión",
				roles: ["USER"],
				items: [{ label: "Cursos", path: "/cursos", trainer: true }],
			},
		];

		expect(filterNavigationSections(sections, viewerOf("ADMIN", true))).toEqual(
			[],
		);
	});
});
