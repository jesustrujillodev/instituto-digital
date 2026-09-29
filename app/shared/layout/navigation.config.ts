import {
	Award,
	BookOpenCheck,
	Building2,
	CalendarDays,
	CalendarRange,
	ClipboardCheck,
	Cloud,
	LayoutDashboard,
	LibraryBig,
	MonitorSmartphone,
	NotebookPen,
	ScrollText,
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
const PLATFORM_ROLES = ["SUPERADMIN"] as const satisfies readonly Role[];

/**
 * Navegación declarativa del dashboard, en secciones ordenadas por intención.
 *
 * Quien cursa ve primero lo suyo —la plataforma existe para tomar cursos— y
 * después lo que imparte u organiza. Los roles de plataforma no cursan (§3):
 * para ellos la administración va primero. Por eso Usuarios, Cursos, Grupos y
 * Calendario aparecen en dos secciones con roles disjuntos; nadie ve el mismo
 * destino dos veces. Los capacitadores no tienen destino propio: son un perfil
 * de la cuenta y se ven, filtran y habilitan en Usuarios.
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
		label: "Mi capacitación",
		roles: LEARNER_ROLES,
		items: [
			{
				label: "Mis cursos",
				path: "/dashboard/mis-cursos",
				icon: BookOpenCheck,
				requiresDependency: true,
			},
			{
				label: "Cursos disponibles",
				path: "/dashboard/cursos-disponibles",
				icon: LibraryBig,
				requiresDependency: true,
			},
			{
				label: "Mis créditos",
				path: "/dashboard/mis-creditos",
				icon: Award,
				requiresDependency: true,
			},
			{
				// Sin `requiresDependency`: un externo no cursa, pero sí recibe
				// certificado y el correo lo trae aquí.
				label: "Mis certificados",
				path: "/dashboard/mis-certificados",
				icon: ScrollText,
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
		// dependencia.
		label: "Gestión",
		roles: LEARNER_ROLES,
		items: [
			{
				// El externo solo imparte (§4): crear cursos exige una dependencia.
				label: "Cursos",
				path: "/dashboard/cursos",
				icon: NotebookPen,
				roles: DEPENDENCY_ROLES,
				trainer: true,
				requiresDependency: true,
			},
			{
				// Lo ve también el capacitador externo: imparte, aunque no cree cursos (§4).
				label: "Impartición",
				path: "/dashboard/imparticion",
				icon: ClipboardCheck,
				roles: DEPENDENCY_ROLES,
				trainer: true,
			},
			{
				label: "Créditos",
				path: "/dashboard/creditos",
				icon: Award,
				roles: DEPENDENCY_ROLES,
			},
			{
				label: "Plan anual",
				path: "/dashboard/plan-anual",
				icon: CalendarRange,
				roles: DEPENDENCY_ROLES,
			},
			{
				label: "Grupos",
				path: "/dashboard/grupos",
				icon: UsersRound,
				roles: DEPENDENCY_ROLES,
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
			},
			{ label: "Usuarios", path: "/dashboard/usuarios", icon: Users },
			{ label: "Nube", path: "/dashboard/nube", icon: Cloud },
		],
	},
	{
		label: "Capacitación",
		roles: PLATFORM_ROLES,
		items: [
			{ label: "Cursos", path: "/dashboard/cursos", icon: NotebookPen },
			{
				label: "Impartición",
				path: "/dashboard/imparticion",
				icon: ClipboardCheck,
			},
			{ label: "Créditos", path: "/dashboard/creditos", icon: Award },
			{
				label: "Plan anual",
				path: "/dashboard/plan-anual",
				icon: CalendarRange,
			},
			{
				// El superadministrador entra a consultar: elige audiencias de cursos de
				// cualquier dependencia. Administrar sigue siendo del titular y el auxiliar.
				label: "Grupos",
				path: "/dashboard/grupos",
				icon: UsersRound,
				roles: ["SUPERADMIN"],
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
		roles: ["SUPERADMIN"],
	},
];
