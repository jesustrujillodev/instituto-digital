import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { canManageTrainer } from "@/modules/trainers/domain/trainer.access";
import type { TrainerDetail } from "@/modules/trainers/domain/trainer.types";
import { canManageUser } from "../domain/user.access.rules";
import type { SafeUser } from "../domain/user.types";

/**
 * Cuenta del listado con lo que la pantalla necesita para pintarla: su perfil
 * de capacitador —activo o deshabilitado— y qué puede hacer con ella quien mira.
 *
 * Los permisos viajan ya decididos para no ofrecer acciones que el servidor
 * rechazaría. El servidor las vuelve a comprobar: esto es UX, no seguridad.
 */
export type UserListItem = SafeUser & {
	trainerProfile: TrainerDetail | null;
	/** Editar, archivar, restablecer contraseña o eliminar la cuenta. */
	canManage: boolean;
	/** Habilitar, editar o deshabilitar su perfil de capacitador. */
	canManageTrainer: boolean;
};

export const toUserListItems = (
	users: readonly SafeUser[],
	profiles: readonly TrainerDetail[],
	actor: Pick<AuthContext, "userId" | "role" | "dependencyId">,
): UserListItem[] => {
	const profileOf = new Map(
		profiles.map((profile) => [profile.userDocumentId, profile]),
	);

	return users.map((user) => ({
		...user,
		trainerProfile: profileOf.get(user.documentId) ?? null,
		canManage: canManageUser(actor, user),
		canManageTrainer: canManageTrainer(actor, user),
	}));
};

/**
 * Fila de la tabla: el usuario con el `id` de tipo string que exige DataTable.
 *
 * El `id` numérico se sustituye —no se añade— por `documentId`: es el
 * identificador público del recurso (el que aparece en las URLs y el que
 * esperan los actions), y la PK interna no tiene por qué viajar al cliente.
 */
export type UserRow = Omit<UserListItem, "id"> & { id: string };

export const toUserRows = (users: UserListItem[]): UserRow[] =>
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
