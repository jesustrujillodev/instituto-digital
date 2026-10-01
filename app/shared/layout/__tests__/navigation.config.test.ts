import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { DASHBOARD_LAYOUT_ID } from "../layout.constants";
import {
	footerNavigationConfig,
	navigationSections,
} from "../navigation.config";
import type { NavItem } from "../navigation.types";
import {
	filterNavigationByRole,
	filterNavigationSections,
} from "../navigation.utils";

const ALL_ROLES = [
	"USER",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
	"SUPERADMIN",
] as const;

const flatten = (items: readonly NavItem[]): NavItem[] =>
	items.flatMap((item) => [item, ...flatten(item.children ?? [])]);

const allMainItems = navigationSections.flatMap((section) => section.items);

/** Todo rol pertenece a una dependencia salvo el de plataforma y el externo. */
const viewerOf = (
	role: Role,
	isTrainer = false,
	hasDependency = role !== "SUPERADMIN",
) => ({ role, isTrainer, hasDependency });

const pathsFor = (items: readonly NavItem[], role: Role, isTrainer = false) =>
	flatten(filterNavigationByRole(items, viewerOf(role, isTrainer)))
		.map((item) => item.path)
		.filter(Boolean);

const mainPathsFor = (
	role: Role,
	isTrainer = false,
	hasDependency = role !== "SUPERADMIN",
) =>
	filterNavigationSections(
		navigationSections,
		viewerOf(role, isTrainer, hasDependency),
	)
		.flatMap((section) => flatten(section.items))
		.map((item) => item.path)
		.filter(Boolean);

const sectionLabelsFor = (role: Role, isTrainer = false) =>
	filterNavigationSections(navigationSections, viewerOf(role, isTrainer)).map(
		(section) => section.label,
	);

describe("navigationSections", () => {
	test("cada entrada declara una etiqueta y un destino o hijos", () => {
		for (const item of flatten(allMainItems)) {
			expect(item.label).toBeTruthy();
			expect(Boolean(item.path) || Boolean(item.children)).toBe(true);
		}
	});

	// Un mismo destino puede vivir en dos secciones con roles disjuntos; lo que
	// no puede pasar es que alguien lo vea dos veces.
	test("nadie ve dos entradas apuntando al mismo path", () => {
		for (const role of ALL_ROLES) {
			for (const isTrainer of [false, true]) {
				const paths = [
					...mainPathsFor(role, isTrainer),
					...pathsFor(footerNavigationConfig, role, isTrainer),
				];

				expect(new Set(paths).size).toBe(paths.length);
			}
		}
	});

	test("cada sección con etiqueta la tiene única", () => {
		const labels = navigationSections
			.map((section) => section.label)
			.filter(Boolean);

		expect(new Set(labels).size).toBe(labels.length);
	});

	test("todas las rutas cuelgan de /dashboard", () => {
		for (const path of flatten([
			...allMainItems,
			...footerNavigationConfig,
		]).map((item) => item.path)) {
			if (path) expect(path.startsWith("/dashboard")).toBe(true);
		}
	});
});

describe("navigationSections — orden por intención", () => {
	// La plataforma existe para tomar cursos: quien cursa ve lo suyo antes que lo
	// que administra.
	test("quien cursa empieza por Mis cursos, justo después del resumen", () => {
		for (const role of [
			"USER",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(mainPathsFor(role, true).slice(0, 2)).toEqual([
				"/dashboard",
				"/dashboard/mis-capacitaciones",
			]);
			expect(sectionLabelsFor(role, true)[1]).toBe("Mi capacitación");
		}
	});

	test("el titular ve su capacitación antes que la gestión", () => {
		expect(sectionLabelsFor("DEPENDENCY_HEAD")).toEqual([
			undefined,
			"Mi capacitación",
			"Gestión",
		]);
	});

	// Los roles de plataforma no cursan (§3): su trabajo principal es la estructura.
	test("los roles de plataforma empiezan por la administración", () => {
		for (const role of ["SUPERADMIN"] as const) {
			expect(sectionLabelsFor(role, true)).toEqual([
				undefined,
				"Administración",
				"Capacitación",
			]);
		}
	});

	test("un participante sin perfil de capacitador no ve la sección de gestión", () => {
		expect(sectionLabelsFor("USER")).toEqual([undefined, "Mi capacitación"]);
		expect(sectionLabelsFor("USER", true)).toContain("Gestión");
	});
});

describe("navigationSections — filtrado por rol", () => {
	// Ocultar un enlace es UX, NO seguridad: la autorización real la impone
	// requireRole en el loader de cada ruta. Aun así, enseñar un destino que
	// devolverá 403 es un callejón sin salida que conviene no pintar.
	test("un USER no ve ningún destino de administración", () => {
		const paths = mainPathsFor("USER");

		expect(paths).not.toContain("/dashboard/usuarios");
	});

	test("un USER sí ve el resumen, que no tiene rol declarado", () => {
		expect(mainPathsFor("USER")).toContain("/dashboard");
	});

	// Los roles globales administran pero no cursan (§3): lo único de un USER que
	// no ven son las pantallas de participante.
	const PARTICIPANT_PATHS = [
		"/dashboard/catalogo-de-capacitaciones",
		"/dashboard/mis-capacitaciones",
		"/dashboard/mis-creditos",
		"/dashboard/mis-certificados",
	];

	test("un SUPERADMIN ve todo lo que ve un USER salvo lo de participante, y además lo suyo", () => {
		const userPaths = mainPathsFor("USER");
		const adminPaths = mainPathsFor("SUPERADMIN");

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
			expect(mainPathsFor(role)).toEqual(
				expect.arrayContaining(PARTICIPANT_PATHS),
			);
		}
		for (const role of ["SUPERADMIN"] as const) {
			for (const path of PARTICIPANT_PATHS) {
				expect(mainPathsFor(role)).not.toContain(path);
			}
		}
	});

	// Cada quien ve lo suyo en el calendario, incluido el capacitador externo.
	test("el calendario lo ve cualquier rol", () => {
		for (const role of ALL_ROLES) {
			expect(mainPathsFor(role)).toContain("/dashboard/calendario");
		}
	});

	// El alta de dependencias es global: la ejerce quien puede crear una unidad
	// organizativa y designarle titular, no quien administra una.
	test("solo el superadministrador ve las dependencias", () => {
		expect(mainPathsFor("SUPERADMIN")).toContain("/dashboard/dependencias");

		for (const role of [
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
			"USER",
		] as const) {
			expect(mainPathsFor(role)).not.toContain("/dashboard/dependencias");
		}
	});

	// Su loader y su action exigen SUPERADMIN: el enlace no puede ofrecerse a más.
	test("solo el superadministrador ve la nube", () => {
		expect(mainPathsFor("SUPERADMIN")).toContain("/dashboard/nube");

		for (const role of [
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
			"USER",
		] as const) {
			expect(mainPathsFor(role)).not.toContain("/dashboard/nube");
		}
	});

	// El capacitador es un perfil de la cuenta, no una sección: se ve, se filtra
	// y se habilita en Usuarios, que solo abre la gestión.
	test("ningún rol tiene un destino propio de capacitadores", () => {
		for (const role of ALL_ROLES) {
			for (const isTrainer of [false, true]) {
				expect(mainPathsFor(role, isTrainer)).not.toContain(
					"/dashboard/capacitadores",
				);
			}
		}
	});

	test("un participante capacitador no ve la gestión de usuarios", () => {
		expect(mainPathsFor("USER", true)).not.toContain("/dashboard/usuarios");
	});

	// El titular y el auxiliar administran a su gente en la MISMA pantalla que el
	// superadministrador: el alcance la recorta. Si el enlace no declarara sus
	// roles, tendrían la función y no la puerta.
	test("el titular y el auxiliar ven la gestión de usuarios", () => {
		for (const role of ["DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY"] as const) {
			expect(mainPathsFor(role)).toContain("/dashboard/usuarios");
		}

		expect(mainPathsFor("USER")).not.toContain("/dashboard/usuarios");
	});

	// El capacitador interno crea cursos con rol USER: si el enlace dependiera
	// solo de roles, tendría la función y no la puerta.
	test("los cursos los ven la gestión y cualquier capacitador", () => {
		for (const role of [
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(mainPathsFor(role)).toContain("/dashboard/capacitaciones");
		}

		expect(mainPathsFor("USER", true)).toContain("/dashboard/capacitaciones");
		expect(mainPathsFor("USER")).not.toContain("/dashboard/capacitaciones");
	});

	test("la impartición la ven la gestión y cualquier capacitador", () => {
		for (const role of [
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(mainPathsFor(role)).toContain("/dashboard/imparticion");
		}

		expect(mainPathsFor("USER", true)).toContain("/dashboard/imparticion");
		expect(mainPathsFor("USER")).not.toContain("/dashboard/imparticion");
	});

	test("los créditos ajenos los ven la gestión y el superadministrador; los propios, quien cursa", () => {
		expect(mainPathsFor("DEPENDENCY_HEAD")).toContain("/dashboard/creditos");
		expect(mainPathsFor("SUPERADMIN")).toContain("/dashboard/creditos");
		expect(mainPathsFor("USER", true)).not.toContain("/dashboard/creditos");

		expect(mainPathsFor("USER")).toContain("/dashboard/mis-creditos");
		expect(mainPathsFor("SUPERADMIN")).not.toContain("/dashboard/mis-creditos");
	});

	test("los certificados propios los ve quien cursa, junto a sus créditos", () => {
		expect(mainPathsFor("USER")).toContain("/dashboard/mis-certificados");
		expect(mainPathsFor("DEPENDENCY_DEPUTY")).toContain(
			"/dashboard/mis-certificados",
		);
		expect(mainPathsFor("SUPERADMIN")).not.toContain(
			"/dashboard/mis-certificados",
		);
	});

	// Rol USER con perfil y sin dependencia: el rol y el perfil le abrirían
	// destinos cuyo loader le responde 403.
	test("el capacitador externo no ve lo que exige una dependencia", () => {
		const external = mainPathsFor("USER", true, false);

		for (const path of [
			"/dashboard/mis-capacitaciones",
			"/dashboard/catalogo-de-capacitaciones",
			"/dashboard/mis-creditos",
			"/dashboard/capacitaciones",
		]) {
			expect(external).not.toContain(path);
		}
		expect(external).toEqual(
			expect.arrayContaining([
				"/dashboard",
				"/dashboard/mis-certificados",
				"/dashboard/calendario",
				"/dashboard/imparticion",
			]),
		);
	});

	test("el plan anual lo ven la gestión de dependencia y el superadministrador", () => {
		for (const role of [
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			expect(mainPathsFor(role)).toContain("/dashboard/plan-anual");
		}

		expect(mainPathsFor("USER", true)).not.toContain("/dashboard/plan-anual");
	});
});

describe("footerNavigationConfig", () => {
	// El monitor de sesiones opera sobre sesiones de terceros: su loader exige
	// SUPERADMIN, así que el enlace tiene que declarar lo mismo.
	test("el monitor de sesiones solo lo ve el superadministrador", () => {
		expect(pathsFor(footerNavigationConfig, "USER")).toEqual([]);
		expect(pathsFor(footerNavigationConfig, "DEPENDENCY_HEAD")).toEqual([]);
		expect(pathsFor(footerNavigationConfig, "SUPERADMIN")).toContain(
			"/dashboard/sesiones",
		);
	});

	// Accesos operativos que se consultan cuando algo va mal: van aparte para no
	// competir por atención con lo que sí se usa a diario.
	test("no duplica ninguna entrada de la navegación principal", () => {
		const mainLabels = flatten(allMainItems).map((item) => item.label);

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
