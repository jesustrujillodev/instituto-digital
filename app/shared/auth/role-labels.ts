import type { Role } from "@/shared/rules/atoms.rules";
import type { SessionUser } from "./session-user";

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

/**
 * Cómo se nombra la cuenta. El externo lleva `USER` en la base sin ser
 * participante; es el único rol sin dependencia además del de plataforma
 * (CHECK `users_type_coherence`).
 */
export const accountLabelOf = (
	user: Pick<SessionUser, "role" | "hasDependency">,
): string =>
	user.role === "USER" && !user.hasDependency
		? "Capacitador externo"
		: ROLE_LABELS[user.role];
