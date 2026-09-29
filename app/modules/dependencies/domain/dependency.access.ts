import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Quién administra dependencias.
 *
 * Crear una unidad organizativa y designarle titular es una decisión global, no
 * de quien administra una: un titular que pudiera crear dependencias podría
 * darse alcance a sí mismo.
 *
 * Se declara una vez y la consumen los tres loaders y los tres actions del
 * módulo. El guard está duplicado por necesidad —un loader protegido no protege
 * las mutaciones de su ruta— y seis listas escritas a mano divergen.
 */
export const DEPENDENCY_ADMIN_ROLES: readonly Role[] = ["SUPERADMIN"];

/**
 * Roles que no pueden ser titulares.
 *
 * El superadministrador administra todo el sistema, no una unidad: designarlo
 * titular le quitaría ese rol, y podría ser el último que queda.
 */
export const HEAD_INELIGIBLE_ROLES: readonly Role[] = ["SUPERADMIN"];

export const canBeHead = (role: Role): boolean =>
	!HEAD_INELIGIBLE_ROLES.includes(role);
