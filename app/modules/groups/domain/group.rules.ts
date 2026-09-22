import * as v from "valibot";
import {
	createListRule,
	SORT_DIRECTIONS,
	type SortDirection,
} from "@/shared/rules/list.rules";

// ── Átomos del módulo ─────────────────────────────────────────────────────────

/**
 * El nombre identifica al grupo dentro de su dependencia y lo vigila el índice
 * único parcial `groups_name_per_dependency`: se recorta antes de validar para
 * que "Mandos" con un espacio delante y sin él no sean dos grupos distintos.
 */
const name = v.pipe(
	v.string("El nombre del grupo es obligatorio."),
	v.trim(),
	v.minLength(3, "El nombre debe tener al menos 3 caracteres."),
	v.maxLength(120, "El nombre no puede superar los 120 caracteres."),
);

const description = v.pipe(
	v.string("La descripción debe ser texto."),
	v.trim(),
	v.maxLength(400, "La descripción no puede superar los 400 caracteres."),
);

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

// ── Entidad ───────────────────────────────────────────────────────────────────

export const groupSchema = v.object({
	id: v.number(),
	documentId: v.string(),
	dependencyId: v.number(),
	/** Aplanado del join. El superadministrador ve grupos de varias. */
	dependencyName: v.string(),
	name: v.string(),
	description: v.nullable(v.string()),
	/** Derivado del conteo de `group_members`, no es columna. */
	memberCount: v.number(),
	archivedAt: v.nullable(v.date()),
	createdAt: v.date(),
	updatedAt: v.date(),
});

/** Estados por los que se puede filtrar el listado. Sin valor ⇒ "active". */
export const GROUP_STATUSES = ["active", "archived", "all"] as const;
export type GroupStatusFilter = (typeof GROUP_STATUSES)[number];

/**
 * Columnas ordenables. Es una allowlist: el valor llega del query string y acaba
 * en un `orderBy`.
 */
export const GROUP_SORT_FIELDS = ["name", "archivedAt", "createdAt"] as const;
export type GroupSortField = (typeof GROUP_SORT_FIELDS)[number];

export { SORT_DIRECTIONS, type SortDirection };

// ── Reglas de entrada ─────────────────────────────────────────────────────────

export const createGroupRule = v.object({
	name,
	description: v.optional(description),
});

export const updateGroupRule = v.partial(
	v.object({
		name,
		description,
	}),
);

export const findGroupRule = v.object({ documentId });

export const listGroupsRule = createListRule({
	/** Filtro ADICIONAL al alcance: pedir otra dependencia no amplía nada. */
	dependency: v.optional(documentId),
	status: v.optional(v.picklist(GROUP_STATUSES, "El estado no es válido.")),
	sortBy: v.optional(
		v.picklist(GROUP_SORT_FIELDS, "No se puede ordenar por ese campo."),
	),
	sortDir: v.optional(
		v.picklist(SORT_DIRECTIONS, "El sentido de ordenación no es válido."),
	),
});

/**
 * Alta de miembros. Varios de una vez porque así se arma una lista nominal: uno
 * a uno multiplicaría los viajes y dejaría el grupo a medias si uno falla.
 */
export const addMembersRule = v.object({
	documentId,
	userDocumentIds: v.pipe(
		v.array(documentId, "Selecciona a las personas que entran al grupo."),
		v.minLength(1, "Selecciona al menos una persona."),
	),
});

export const removeMemberRule = v.object({
	documentId,
	userDocumentId: documentId,
});

export const listCandidatesRule = v.object({
	documentId,
	search: v.optional(
		v.pipe(
			v.string("El término de búsqueda debe ser texto."),
			v.trim(),
			v.maxLength(120, "La búsqueda no puede superar los 120 caracteres."),
		),
	),
});

export const groupRules = {
	create: createGroupRule,
	update: updateGroupRule,
	find: findGroupRule,
	list: listGroupsRule,
	addMembers: addMembersRule,
	removeMember: removeMemberRule,
	listCandidates: listCandidatesRule,
} as const;
