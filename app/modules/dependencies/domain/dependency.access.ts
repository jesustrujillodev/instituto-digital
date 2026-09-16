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
