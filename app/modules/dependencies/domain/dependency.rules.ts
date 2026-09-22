import * as v from "valibot";
import {
	createListRule,
	SORT_DIRECTIONS,
	type SortDirection,
} from "@/shared/rules/list.rules";

// ── Átomos del módulo ─────────────────────────────────────────────────────────

/**
 * El nombre es la identidad pública de la dependencia y la columna `@unique`: se
 * recorta antes de validar para que "Obras" con un espacio delante y sin él no
 * sean dos unidades distintas que la base acepta por separado.
 */
const name = v.pipe(
	v.string("El nombre de la dependencia es obligatorio."),
	v.trim(),
	v.minLength(3, "El nombre debe tener al menos 3 caracteres."),
	v.maxLength(120, "El nombre no puede superar los 120 caracteres."),
);

/** Siglas con las que se la conoce a diario. Opcional: no todas tienen. */
const acronym = v.pipe(
	v.string("Las siglas deben ser texto."),
	v.trim(),
	v.maxLength(16, "Las siglas no pueden superar los 16 caracteres."),
);

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

// ── Entidad ───────────────────────────────────────────────────────────────────

export const dependencySchema = v.object({
	id: v.number(),
	documentId: v.string(),
	name: v.string(),
	acronym: v.nullable(v.string()),
	// Soft delete: null = activa, fecha = instante en que se desactivó.
	archivedAt: v.nullable(v.date()),
	createdAt: v.date(),
	updatedAt: v.date(),
});

/** Estados por los que se puede filtrar el listado. Sin valor ⇒ "active". */
export const DEPENDENCY_STATUSES = ["active", "archived", "all"] as const;
export type DependencyStatusFilter = (typeof DEPENDENCY_STATUSES)[number];

/**
 * Columnas por las que se puede ordenar.
 *
 * Es una allowlist, no una sugerencia: el valor llega del query string y acaba
 * en un `orderBy`, así que solo pueden pasar nombres de columna conocidos.
 */
export const DEPENDENCY_SORT_FIELDS = [
	"name",
	"acronym",
	"archivedAt",
	"createdAt",
] as const;
export type DependencySortField = (typeof DEPENDENCY_SORT_FIELDS)[number];

export { SORT_DIRECTIONS, type SortDirection };

// ── Reglas de entrada ─────────────────────────────────────────────────────────

export const createDependencyRule = v.object({
	name,
	acronym: v.optional(acronym),
});

export const updateDependencyRule = v.partial(
	v.object({
		name,
		acronym,
	}),
);

export const findDependencyRule = v.object({ documentId });

export const listDependenciesRule = createListRule({
	status: v.optional(
		v.picklist(DEPENDENCY_STATUSES, "El estado no es válido."),
	),
	sortBy: v.optional(
		v.picklist(DEPENDENCY_SORT_FIELDS, "No se puede ordenar por ese campo."),
	),
	sortDir: v.optional(
		v.picklist(SORT_DIRECTIONS, "El sentido de ordenación no es válido."),
	),
});

/**
 * Designación de titular. Los dos identificadores son públicos (`documentId`):
 * el interno no viaja al cliente y la traducción es del repositorio.
 */
export const assignHeadRule = v.object({
	documentId,
	userDocumentId: documentId,
});

export const dependencyRules = {
	create: createDependencyRule,
	update: updateDependencyRule,
	find: findDependencyRule,
	list: listDependenciesRule,
	assignHead: assignHeadRule,
} as const;
