import type { Dependency } from "../domain/dependency.types";

/**
 * Fila de la tabla: la dependencia con el `id` de tipo string que exige
 * DataTable.
 *
 * El `id` numérico se sustituye —no se añade— por `documentId`: es el
 * identificador público del recurso (el que aparece en las URLs y el que esperan
 * los actions), y la PK interna no tiene por qué viajar al cliente.
 */
export type DependencyRow = Omit<Dependency, "id"> & { id: string };

export const toDependencyRows = (dependencies: Dependency[]): DependencyRow[] =>
	dependencies.map(({ id: _internalId, ...dependency }) => ({
		...dependency,
		id: dependency.documentId,
	}));

/**
 * Cómo se nombra una dependencia en una línea: "Obras Públicas (SOP)", o solo su
 * nombre si no tiene siglas registradas.
 */
export const labelOf = (dependency: Pick<Dependency, "name" | "acronym">) =>
	dependency.acronym
		? `${dependency.name} (${dependency.acronym})`
		: dependency.name;
