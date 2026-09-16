import type { Group, GroupMemberEntry } from "../domain/group.types";

/**
 * Fila de la tabla: el grupo con el `id` de tipo string que exige DataTable.
 *
 * El `id` numérico se sustituye —no se añade— por `documentId`: es el
 * identificador público del recurso y la PK interna no tiene por qué viajar al
 * cliente.
 */
export type GroupRow = Omit<Group, "id"> & { id: string };

export const toGroupRows = (groups: Group[]): GroupRow[] =>
	groups.map(({ id: _internalId, ...group }) => ({
		...group,
		id: group.documentId,
	}));

/** Nombre completo de un miembro, o su correo si no lo tiene capturado. */
export const memberNameOf = (member: GroupMemberEntry) =>
	[member.firstName, member.lastName].filter(Boolean).join(" ").trim() ||
	member.email;
