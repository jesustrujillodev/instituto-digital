import * as v from "valibot";
import { safeUserSchema, userSchema } from "./user.rules";
import type { SafeUser, User } from "./user.types";

/**
 * Fila cruda de persistencia → usuario de dominio sin credenciales.
 *
 * Se parsea contra `safeUserSchema` (el mismo de user.rules, no una copia) para
 * que añadir un campo al esquema no exija recordar actualizar también el mapper.
 */
export const toDomain = (raw: Record<string, unknown>): SafeUser => {
	const { password: _, ...rest } = raw;
	return v.parse(safeUserSchema, rest);
};

/**
 * Fila cruda → usuario de dominio CON credenciales.
 *
 * La consume solo `findByEmail`, el único punto donde `auth` necesita el hash
 * para compararlo. Existe para que esa lectura pase por el esquema como todas las
 * demás: era la única del módulo que devolvía la fila de Prisma sin validar, así
 * que un rol fuera de la tupla o una columna corrupta no se detectaban aquí sino
 * al firmar el token, tres capas más arriba.
 */
export const toDomainWithPassword = (raw: Record<string, unknown>): User =>
	v.parse(userSchema, raw);
