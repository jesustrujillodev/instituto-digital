import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { DASHBOARD_LAYOUT_ID } from "../layout.constants";
import { footerNavigationConfig, navigationConfig } from "../navigation.config";
import type { NavItem } from "../navigation.types";
import { filterNavigationByRole } from "../navigation.utils";

const flatten = (items: readonly NavItem[]): NavItem[] =>
	items.flatMap((item) => [item, ...flatten(item.children ?? [])]);

const pathsFor = (items: readonly NavItem[], role: Role, isTrainer = false) =>
	flatten(filterNavigationByRole(items, { role, isTrainer }))
		.map((item) => item.path)
		.filter(Boolean);

describe("navigationConfig", () => {
	test("cada entrada declara una etiqueta y un destino o hijos", () => {
		for (const item of flatten(navigationConfig)) {
			expect(item.label).toBeTruthy();
			expect(Boolean(item.path) || Boolean(item.children)).toBe(true);
		}
	});

	test("no hay dos entradas apuntando al mismo path", () => {
		const paths = flatten([...navigationConfig, ...footerNavigationConfig])
			.map((item) => item.path)
			.filter(Boolean);

		expect(new Set(paths).size).toBe(paths.length);
	});

	test("todas las rutas cuelgan de /dashboard", () => {
		for (const path of flatten([
			...navigationConfig,
			...footerNavigationConfig,
		]).map((item) => item.path)) {
			if (path) expect(path.startsWith("/dashboard")).toBe(true);
		}
	});
});

describe("navigationConfig — filtrado por rol", () => {
	// Ocultar un enlace es UX, NO seguridad: la autorización real la impone
	// requireRole en el loader de cada ruta. Aun así, enseñar un destino que
	// devolverá 403 es un callejón sin salida que conviene no pintar.
	test("un USER no ve ningún destino de administración", () => {
		const paths = pathsFor(navigationConfig, "USER");

		expect(paths).not.toContain("/dashboard/usuarios");
	});

	test("un USER sí ve el resumen, que no tiene rol declarado", () => {
		expect(pathsFor(navigationConfig, "USER")).toContain("/dashboard");
	});

	// Los roles globales administran pero no cursan (§3): lo único de un USER que
	// no ven son las pantallas de participante.
	const PARTICIPANT_PATHS = [
		"/dashboard/cursos-disponibles",
		"/dashboard/mis-cursos",
	];

	test("un ADMIN ve todo lo que ve un USER salvo lo de participante, y además lo suyo", () => {
		const userPaths = pathsFor(navigationConfig, "USER");
		const adminPaths = pathsFor(navigationConfig, "ADMIN");

		for (const path of userPaths) {
			if (path && !PARTICIPANT_PATHS.includes(path)) {
				expect(adminPaths).toContain(path);
			}
		}
		expect(adminPaths).toContain("/dashboard/usuarios");
	});

	test("cursos disponibles y mis cursos son de quien cursa", () => {
		for (const role of [
			"USER",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(pathsFor(navigationConfig, role)).toEqual(
				expect.arrayContaining(PARTICIPANT_PATHS),
			);
		}
		for (const role of ["ADMIN", "SUPERADMIN"] as const) {
			for (const path of PARTICIPANT_PATHS) {
				expect(pathsFor(navigationConfig, role)).not.toContain(path);
			}
		}
	});

	// Cada quien ve lo suyo en el calendario, incluido el capacitador externo.
	test("el calendario lo ve cualquier rol", () => {
		for (const role of [
			"USER",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
			"SUPERADMIN",
			"ADMIN",
		] as const) {
			expect(pathsFor(navigationConfig, role)).toContain(
				"/dashboard/calendario",
			);
		}
	});

	// El alta de dependencias es global: la ejerce quien puede crear una unidad
	// organizativa y designarle titular, no quien administra una.
	test("solo el superadministrador ve las dependencias", () => {
		expect(pathsFor(navigationConfig, "SUPERADMIN")).toContain(
			"/dashboard/dependencias",
		);

		for (const role of [
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
			"USER",
			"ADMIN",
		] as const) {
			expect(pathsFor(navigationConfig, role)).not.toContain(
				"/dashboard/dependencias",
			);
		}
	});

	// El titular y el auxiliar administran a su gente en la MISMA pantalla que el
	// superadministrador: el alcance la recorta. Si el enlace no declarara sus
	// roles, tendrían la función y no la puerta.
	test("el titular y el auxiliar ven la gestión de usuarios", () => {
		for (const role of ["DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY"] as const) {
			expect(pathsFor(navigationConfig, role)).toContain("/dashboard/usuarios");
		}

		expect(pathsFor(navigationConfig, "USER")).not.toContain(
			"/dashboard/usuarios",
		);
	});

	// El capacitador interno crea cursos con rol USER: si el enlace dependiera
	// solo de roles, tendría la función y no la puerta.
	test("los cursos los ven la gestión y cualquier capacitador", () => {
		for (const role of [
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(pathsFor(navigationConfig, role)).toContain("/dashboard/cursos");
		}

		expect(pathsFor(navigationConfig, "USER", true)).toContain(
			"/dashboard/cursos",
		);
		expect(pathsFor(navigationConfig, "USER")).not.toContain(
			"/dashboard/cursos",
		);
	});
});

describe("footerNavigationConfig", () => {
	// El monitor de sesiones opera sobre sesiones de terceros: su loader exige los
	// roles de plataforma, así que el enlace tiene que declarar los mismos.
	test("el monitor de sesiones está restringido a los roles de plataforma", () => {
		expect(pathsFor(footerNavigationConfig, "USER")).toEqual([]);
		expect(pathsFor(footerNavigationConfig, "DEPENDENCY_HEAD")).toEqual([]);

		for (const role of ["ADMIN", "SUPERADMIN"] as const) {
			expect(pathsFor(footerNavigationConfig, role)).toContain(
				"/dashboard/sesiones",
			);
		}
	});

	// El tema es de toda la plataforma: su loader y su action exigen SUPERADMIN.
	test("personalización solo la ve el superadministrador", () => {
		expect(pathsFor(footerNavigationConfig, "SUPERADMIN")).toContain(
			"/dashboard/personalizacion",
		);

		for (const role of [
			"ADMIN",
			"USER",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(pathsFor(footerNavigationConfig, role)).not.toContain(
				"/dashboard/personalizacion",
			);
		}
	});

	// Accesos operativos que se consultan cuando algo va mal: van aparte para no
	// competir por atención con lo que sí se usa a diario.
	test("no duplica ninguna entrada de la navegación principal", () => {
		const mainLabels = flatten(navigationConfig).map((item) => item.label);

		for (const item of flatten(footerNavigationConfig)) {
			expect(mainLabels).not.toContain(item.label);
		}
	});
});

describe("DASHBOARD_LAYOUT_ID", () => {
	// Id estable declarado a mano: `useRouteLoaderData(routeId)` recibe un string
	// sin comprobación de tipos, así que renombrar el archivo del layout rompería
	// el hook en silencio y en runtime.
	test("es el id estable que comparten routes.ts y useAuth", () => {
		expect(DASHBOARD_LAYOUT_ID).toBe("dashboard-layout");
	});
});
