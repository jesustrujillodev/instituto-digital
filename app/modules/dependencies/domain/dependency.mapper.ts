import * as v from "valibot";
import { dependencySchema } from "./dependency.rules";
import type { Dependency } from "./dependency.types";

/**
 * Fila cruda de persistencia → dependencia de dominio.
 *
 * Se parsea contra `dependencySchema` (el mismo de dependency.rules, no una
 * copia) para que añadir un campo al esquema no exija recordar actualizar
 * también el mapper. A diferencia de `users` no hay variante "safe": la entidad
 * no tiene credenciales ni columnas de otros módulos que ocultar.
 */
export const toDomain = (raw: Record<string, unknown>): Dependency =>
	v.parse(dependencySchema, raw);
