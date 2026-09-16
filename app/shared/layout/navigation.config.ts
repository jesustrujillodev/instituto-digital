import {
	BookOpenCheck,
	Building2,
	CalendarDays,
	Cloud,
	LayoutDashboard,
	LibraryBig,
	MonitorSmartphone,
	NotebookPen,
	Palette,
	Presentation,
	Users,
	UsersRound,
} from "lucide-react";
import type { Role } from "@/shared/rules/atoms.rules";
import type { NavItem, NavSection } from "./navigation.types";

const LEARNER_ROLES = [
	"USER",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
] as const satisfies readonly Role[];
const DEPENDENCY_ROLES = [
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
] as const satisfies readonly Role[];
const PLATFORM_ROLES = [
	"ADMIN",
	"SUPERADMIN",
] as const satisfies readonly Role[];

/**
 * Navegación declarativa del dashboard, en secciones ordenadas por intención.
 *
 * Quien cursa ve primero lo suyo —la plataforma existe para tomar cursos— y
 * después lo que imparte u organiza. Los roles de plataforma no cursan (§3):
 * para ellos la administración va primero. Por eso Usuarios, Cursos, Grupos,
 * Capacitadores y Calendario aparecen en dos secciones con roles disjuntos;
 * nadie ve el mismo destino dos veces.
 *
 * `roles` está tipado como `readonly Role[]`: un rol inexistente NO compila.
 * `trainer` marca los items que además ve cualquier capacitador.
 *
 * Esto es UX, no seguridad — ocultar un enlace no protege nada. La autorización
 * real la impone `requireRole` en el loader de cada ruta, así que un usuario que
 * navegue directo a la URL sigue recibiendo un 403.
 *
 * Es `.ts` y no `.tsx` a propósito: los iconos son *referencias* a componentes,
 * aquí no hay JSX.
 */
export const navigationSections: readonly NavSection[] = [
	{
		items: [{ label: "Resumen", path: "/dashboard", icon: LayoutDashboard }],
	},
	{
		// Aquí entran créditos, calificaciones y constancias cuando existan.
		label: "Mi capacitación",
		roles: LEARNER_ROLES,
		items: [
			{
				label: "Mis cursos",
				path: "/dashboard/mis-cursos",
				icon: BookOpenCheck,
			},
			{
				// Lo ve también el capacitador externo, que tiene rol USER; el loader le responde 403.
				label: "Cursos disponibles",
				path: "/dashboard/cursos-disponibles",
				icon: LibraryBig,
			},
			{
				label: "Calendario",
				path: "/dashboard/calendario",
				icon: CalendarDays,
			},
		],
	},
	{
		// Incluye USER para el capacitador interno, que crea cursos sin rol de
		// dependencia. El externo también ve Cursos —`SessionUser` no distingue el
		// tipo de cuenta— y el loader le responde 403.
		label: "Gestión",
		roles: LEARNER_ROLES,
		items: [
			{
				label: "Cursos",
				path: "/dashboard/cursos",
				icon: NotebookPen,
				roles: DEPENDENCY_ROLES,
				trainer: true,
			},
			{
				label: "Grupos",
				path: "/dashboard/grupos",
				icon: UsersRound,
				roles: DEPENDENCY_ROLES,
			},
			{
				// El catálogo es global y lo consulta cualquier capacitador (§3 del alcance).
				label: "Capacitadores",
				path: "/dashboard/capacitadores",
				icon: Presentation,
				roles: DEPENDENCY_ROLES,
				trainer: true,
			},
			{
				// La MISMA pantalla que usa el superadministrador: el alcance la recorta
				// a su dependencia. Una segunda lista duplicaría el query con otro guard,
				// que es donde se cuelan los fallos de aislamiento.
				label: "Usuarios",
				path: "/dashboard/usuarios",
				icon: Users,
				roles: DEPENDENCY_ROLES,
			},
		],
	},
	{
		label: "Administración",
		roles: PLATFORM_ROLES,
		items: [
			{
				label: "Dependencias",
				path: "/dashboard/dependencias",
				icon: Building2,
				roles: ["SUPERADMIN"],
			},
			{ label: "Usuarios", path: "/dashboard/usuarios", icon: Users },
			{ label: "Nube", path: "/dashboard/nube", icon: Cloud, roles: ["ADMIN"] },
		],
	},
	{
		label: "Capacitación",
		roles: PLATFORM_ROLES,
		items: [
			{ label: "Cursos", path: "/dashboard/cursos", icon: NotebookPen },
			{
				// El superadministrador entra a consultar: elige audiencias de cursos de
				// cualquier dependencia. Administrar sigue siendo del titular y el auxiliar.
				label: "Grupos",
				path: "/dashboard/grupos",
				icon: UsersRound,
				roles: ["SUPERADMIN"],
			},
			{
				label: "Capacitadores",
				path: "/dashboard/capacitadores",
				icon: Presentation,
			},
			{
				label: "Calendario",
				path: "/dashboard/calendario",
				icon: CalendarDays,
			},
		],
	},
];

/**
 * Navegación anclada al PIE de la barra.
 *
 * Es para accesos operativos que no forman parte del recorrido de trabajo
 * habitual: se consultan cuando algo va mal, no todos los días. Mantenerlos
 * fuera del menú principal evita que compitan por atención con lo que sí se usa
 * a diario.
 *
 * Rige el mismo filtrado por rol —y la misma advertencia— que la navegación
 * principal: es UX, no seguridad.
 */
export const footerNavigationConfig: readonly NavItem[] = [
	{
		label: "Sesiones",
		path: "/dashboard/sesiones",
		icon: MonitorSmartphone,
		roles: ["ADMIN", "SUPERADMIN"],
	},
	{
		label: "Personalización",
		path: "/dashboard/personalizacion",
		icon: Palette,
		roles: ["SUPERADMIN"],
	},
];
