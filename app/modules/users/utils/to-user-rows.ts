import type { SafeUser } from "../domain/user.types";

/**
 * Fila de la tabla: el usuario con el `id` de tipo string que exige DataTable.
 *
 * El `id` numérico se sustituye —no se añade— por `documentId`: es el
 * identificador público del recurso (el que aparece en las URLs y el que
 * esperan los actions), y la PK interna no tiene por qué viajar al cliente.
 */
export type UserRow = Omit<SafeUser, "id"> & { id: string };

export const toUserRows = (users: SafeUser[]): UserRow[] =>
	users.map(({ id: _internalId, ...user }) => ({
		...user,
		id: user.documentId,
	}));

/** Nombre completo, o un guion si la cuenta no tiene nombre registrado. */
export const fullNameOf = (user: Pick<SafeUser, "firstName" | "lastName">) =>
	[user.firstName, user.lastName].filter(Boolean).join(" ").trim();

/** Iniciales para el avatar; cae al correo cuando no hay nombre. */
export const initialsOf = (
	user: Pick<SafeUser, "firstName" | "lastName" | "email">,
) => {
	const letters =
		`${user.firstName?.at(0) ?? ""}${user.lastName?.at(0) ?? ""}`.trim();

	return (letters || user.email.at(0) || "?").toUpperCase();
};
