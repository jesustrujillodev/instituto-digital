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
const name = v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(120));

const description = v.pipe(v.string(), v.trim(), v.maxLength(400));

const documentId = v.pipe(v.string(), v.uuid());

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
	status: v.optional(v.picklist(GROUP_STATUSES)),
	sortBy: v.optional(v.picklist(GROUP_SORT_FIELDS)),
	sortDir: v.optional(v.picklist(SORT_DIRECTIONS)),
});

/**
 * Alta de miembros. Varios de una vez porque así se arma una lista nominal: uno
 * a uno multiplicaría los viajes y dejaría el grupo a medias si uno falla.
 */
export const addMembersRule = v.object({
	documentId,
	userDocumentIds: v.pipe(v.array(documentId), v.minLength(1)),
});

export const removeMemberRule = v.object({
	documentId,
	userDocumentId: documentId,
});

export const listCandidatesRule = v.object({
	documentId,
	search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
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
