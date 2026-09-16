import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Proyección de identidad expuesta al CLIENTE.
 *
 * Deliberadamente NO incluye `userId` (la PK interna de la base): fuera del
 * servidor el usuario se identifica siempre por `documentId`. Todo lo que se
 * ponga aquí viaja serializado en el HTML, así que el criterio es "lo mínimo
 * que la UI necesita para pintar", no "lo que hay en AuthContext".
 *
 * Client-safe: sin imports de `.server`.
 */
export interface SessionUser {
	documentId: string;
	email: string;
	role: Role;
	/** A diferencia de `dependencyId`, es un booleano que no identifica nada y la UI lo necesita. */
	isTrainer: boolean;
}
