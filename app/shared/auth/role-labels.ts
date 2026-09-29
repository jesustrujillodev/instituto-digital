import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Nombre de cada rol en pantalla. Nunca se pinta el identificador de la tupla.
 *
 * Tipado `Record<Role, string>`: añadir un rol a `ROLES` rompe aquí en
 * compilación en vez de mostrar su identificador crudo.
 */
export const ROLE_LABELS: Record<Role, string> = {
	SUPERADMIN: "Superadministrador",
	DEPENDENCY_HEAD: "Titular",
	DEPENDENCY_DEPUTY: "Auxiliar",
	USER: "Participante",
};
