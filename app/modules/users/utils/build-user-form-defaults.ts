import type { Role } from "@/shared/rules/atoms.rules";
import type { UserType } from "../domain/user.rules";
import type { SafeUser } from "../domain/user.types";

export interface UserFormValues {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	role: Role;
	password: string;
	type: UserType;
	employeeNumber: string;
	jobTitle: string;
	/** documentId de la dependencia, no su id interno: es lo que envía el form. */
	dependency: string;
}

const DEFAULT_ROLE: Role = "USER";

/**
 * Valores iniciales del formulario.
 *
 * Ningún campo puede quedar `undefined`: react-hook-form nacería con inputs no
 * controlados y `isDirty` dejaría de ser fiable, que es lo que gobierna el aviso
 * de cambios sin guardar.
 *
 * `dependency` sale del catálogo y no del usuario porque `SafeUser` guarda el id
 * interno, que nunca viaja al cliente: lo resuelve quien pinta el formulario.
 */
export function buildUserFormDefaults(
	user?: SafeUser | null,
	dependencyDocumentId?: string,
): UserFormValues {
	return {
		firstName: user?.firstName ?? "",
		lastName: user?.lastName ?? "",
		email: user?.email ?? "",
		phone: user?.phone ?? "",
		// Ya no hace falta `as Role`: `userSchema.role` valida contra la tupla, así
		// que `SafeUser["role"]` es `Role` y no un string cualquiera.
		role: user?.role ?? DEFAULT_ROLE,
		password: "",
		type: user?.type ?? "INTERNAL",
		employeeNumber: user?.employeeNumber ?? "",
		jobTitle: user?.jobTitle ?? "",
		dependency: dependencyDocumentId ?? "",
	};
}
