import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AccessScope } from "@/shared/auth/scope.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	CreateGroupDto,
	GroupListResponse,
	GroupMemberEntry,
	GroupResponse,
	ListGroupsDto,
	MemberCandidate,
	UpdateGroupDto,
} from "./group.types";

/**
 * Casos de uso del módulo.
 *
 * Las LECTURAS reciben `scope`; las MUTACIONES reciben el `AuthContext`
 * completo, porque además del alcance necesitan al autor para la bitácora de
 * alta de miembros.
 *
 * Un alcance que no sea de dependencia puede leer y no escribir: es lo que deja
 * al superadministrador consultar grupos ajenos sin administrarlos.
 */
export interface IGroupService {
	list(filters: ListGroupsDto, scope: AccessScope): Promise<GroupListResponse>;
	/** Falla con `GROUP_NOT_FOUND` si no existe O si cae fuera del alcance. */
	findById(documentId: string, scope: AccessScope): Promise<GroupResponse>;
	listMembers(
		documentId: string,
		scope: AccessScope,
	): Promise<AppResponse<GroupMemberEntry[]>>;
	/** Candidatos de la dependencia DEL GRUPO, nunca de la de quien busca. */
	listCandidates(
		documentId: string,
		search: string | undefined,
		scope: AccessScope,
	): Promise<AppResponse<MemberCandidate[]>>;
	create(dto: CreateGroupDto, actor: AuthContext): Promise<GroupResponse>;
	update(
		documentId: string,
		dto: UpdateGroupDto,
		actor: AuthContext,
	): Promise<GroupResponse>;
	archive(documentId: string, actor: AuthContext): Promise<GroupResponse>;
	unarchive(documentId: string, actor: AuthContext): Promise<GroupResponse>;
	/**
	 * Alta de miembros. Rechaza el lote entero si alguna cuenta no cumple: dejar
	 * dentro a las válidas y callar el resto convertiría un error en una lista
	 * silenciosamente incompleta.
	 */
	addMembers(
		documentId: string,
		userDocumentIds: readonly string[],
		actor: AuthContext,
	): Promise<GroupResponse>;
	removeMember(
		documentId: string,
		userDocumentId: string,
		actor: AuthContext,
	): Promise<GroupResponse>;
}
