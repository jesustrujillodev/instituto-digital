import * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import { createResponseSchema } from "@/shared/rules/response.rules";
import type {
	adminResetPasswordRule,
	changeDependencyRule,
	changePasswordRule,
	createUserRule,
	deleteUserRule,
	findUserRule,
	listUsersRule,
	updateUserRule,
} from "./user.rules";
import { safeUserSchema, type userSchema } from "./user.rules";

export type User = v.InferOutput<typeof userSchema>;
export type SafeUser = v.InferOutput<typeof safeUserSchema>;

export type CreateUserDto = v.InferInput<typeof createUserRule>;

/**
 * Lo que el repositorio ESCRIBE al crear, que no es lo que llega del formulario.
 *
 * Difiere del DTO de frontera en dos cosas y las dos las resuelve el servicio:
 * `password` ya viene hasheada, y la dependencia ya está traducida de su
 * `documentId` público al `dependencyId` interno que guarda la columna.
 *
 * Separarlos es lo que impide que el identificador público llegue a Prisma —donde
 * `dependency` es el nombre de la RELACIÓN, no de la columna— y lo que obliga a
 * pasar por la comprobación de que la dependencia destino existe y está activa.
 */
export type CreateUserData = Omit<CreateUserDto, "dependency" | "password"> & {
	password: string;
	dependencyId?: number | null;
};
export type UpdateUserDto = v.InferInput<typeof updateUserRule>;
export type ChangePasswordDto = v.InferInput<typeof changePasswordRule>;
export type AdminResetPasswordDto = v.InferInput<typeof adminResetPasswordRule>;
export type FindUserDto = v.InferInput<typeof findUserRule>;
export type ListUsersDto = v.InferInput<typeof listUsersRule>;
export type DeleteUserDto = v.InferInput<typeof deleteUserRule>;
export type ChangeDependencyDto = v.InferInput<typeof changeDependencyRule>;

/**
 * Una línea de la bitácora de adscripción, ya legible.
 *
 * Lleva los nombres de las dependencias y no sus ids porque es lo único que la
 * pantalla necesita, y `bySelf` en vez del id del autor porque la distinción que
 * importa a quien lo lee es "lo hice yo" contra "me lo hicieron".
 */
export interface DependencyChangeEntry {
	id: number;
	fromDependencyName: string | null;
	toDependencyName: string;
	bySelf: boolean;
	createdAt: Date;
}

// ===============================================================
// Contrato de respuesta del modulo
// ===============================================================

/** Un usuario dentro del envelope estandar. */
export type UserResponse = AppResponse<SafeUser>;

/** Página de usuarios; el total y las páginas viajan en `pagination`. */
export type UserListResponse = AppResponse<SafeUser[]>;

/** Operaciones sin dato de vuelta (reset de contraseña, borrado). */
export type UserVoidResponse = AppResponse<null>;

// Instancias valibot del envelope con el dato de este dominio. Existen para
// validar la respuesta cuando cruza una frontera real —un contract test, o el
// día que este servicio viva detrás de HTTP— sin volver a describir la forma.
export const userResponseSchema = createResponseSchema(safeUserSchema);

export const userListResponseSchema = createResponseSchema(
	v.array(safeUserSchema),
);
