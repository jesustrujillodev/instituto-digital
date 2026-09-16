import * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import { createResponseSchema } from "@/shared/rules/response.rules";
import type {
	addMembersRule,
	createGroupRule,
	findGroupRule,
	listCandidatesRule,
	listGroupsRule,
	removeMemberRule,
	updateGroupRule,
} from "./group.rules";
import { groupSchema } from "./group.rules";

export type Group = v.InferOutput<typeof groupSchema>;

export type CreateGroupDto = v.InferInput<typeof createGroupRule>;
export type UpdateGroupDto = v.InferInput<typeof updateGroupRule>;
export type FindGroupDto = v.InferInput<typeof findGroupRule>;
export type ListGroupsDto = v.InferInput<typeof listGroupsRule>;
export type AddMembersDto = v.InferInput<typeof addMembersRule>;
export type RemoveMemberDto = v.InferInput<typeof removeMemberRule>;
export type ListCandidatesDto = v.InferInput<typeof listCandidatesRule>;

/**
 * Lo que el repositorio ESCRIBE al crear. La dependencia ya está resuelta desde
 * el alcance de quien crea: el formulario no la elige.
 */
export type CreateGroupData = CreateGroupDto & { dependencyId: number };

/**
 * Una línea de la lista de miembros.
 *
 * Lleva la dependencia ACTUAL de la persona y no la que tenía al entrar: quien
 * se cambia sigue en el grupo, y mostrar la de entonces sería inventar un dato
 * que la fila no guarda.
 */
export interface GroupMemberEntry {
	userDocumentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	dependencyName: string | null;
	addedAt: Date;
}

/** Cuenta elegible como miembro. Lleva lo justo para pintar un selector. */
export interface MemberCandidate {
	documentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
}

/** Lo mínimo que el módulo necesita de una cuenta para decidir sobre ella. */
export interface GroupMemberAccount {
	id: number;
	documentId: string;
}

// ===============================================================
// Contrato de respuesta del modulo
// ===============================================================

export type GroupResponse = AppResponse<Group>;
export type GroupListResponse = AppResponse<Group[]>;

export const groupResponseSchema = createResponseSchema(groupSchema);
export const groupListResponseSchema = createResponseSchema(
	v.array(groupSchema),
);
