import * as v from "valibot";
import { groupSchema } from "./group.rules";
import type { Group } from "./group.types";

/**
 * Fila cruda de persistencia → grupo de dominio.
 *
 * Ni `memberCount` ni `dependencyName` son columnas: llegan del `_count` y del
 * join, y se aplanan aquí para que ninguna capa de arriba conozca su forma.
 */
export const toDomain = (raw: {
	_count?: { members: number };
	dependency?: { name: string };
	[key: string]: unknown;
}): Group => {
	const { _count, dependency, ...rest } = raw;

	return v.parse(groupSchema, {
		...rest,
		dependencyName: dependency?.name ?? "",
		memberCount: _count?.members ?? 0,
	});
};
