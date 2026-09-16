import {
	Building2,
	Cloud,
	LayoutDashboard,
	MonitorSmartphone,
	Palette,
	Users,
} from "lucide-react";
import type { NavItem } from "./navigation.types";

/**
 * Navegación declarativa del dashboard.
 *
 * `roles` está tipado como `readonly Role[]`: un rol inexistente NO compila.
 *
 * Esto es UX, no seguridad — ocultar un enlace no protege nada. La autorización
 * real la impone `requireRole` en el loader de cada ruta, así que un usuario que
 * navegue directo a la URL sigue recibiendo un 403.
 *
 * Es `.ts` y no `.tsx` a propósito: los iconos son *referencias* a componentes,
 * aquí no hay JSX.
 */
export const navigationConfig: readonly NavItem[] = [
	{
		label: "Resumen",
		path: "/dashboard",
		icon: LayoutDashboard,
	},
	{
		label: "Nube",
		path: "/dashboard/nube",
		icon: Cloud,
		roles: ["ADMIN"],
	},
	{
		label: "Dependencias",
		path: "/dashboard/dependencias",
		icon: Building2,
		roles: ["SUPERADMIN"],
	},
	{
		// El titular y el auxiliar entran a la MISMA pantalla que el
		// superadministrador: el alcance ya la recorta a su dependencia. Una
		// segunda lista "directorio de mi personal" duplicaría el query con otro
		// guard, que es donde se cuelan los fallos de aislamiento.
		label: "Usuarios",
		path: "/dashboard/usuarios",
		icon: Users,
		roles: ["ADMIN", "SUPERADMIN", "DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY"],
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
		roles: ["ADMIN", "SUPERADMIN"],
	},
];
