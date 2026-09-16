import type { AccessScope } from "@/shared/auth/scope.rules";
import type {
	CreateGroupData,
	Group,
	GroupMemberAccount,
	GroupMemberEntry,
	ListGroupsDto,
	MemberCandidate,
	UpdateGroupDto,
} from "./group.types";

/**
 * El alcance es un PARÁMETRO de cada operación, no un valor inyectado.
 *
 * Fuera de alcance se ve igual que inexistente: las escrituras llevan el filtro
 * junto a la clave única, así que Prisma lanza P2025 y se traduce a
 * `GroupNotFoundError`.
 */
export interface IGroupRepository {
	findAll(filters: ListGroupsDto, scope: AccessScope): Promise<Group[]>;
	/** Total con los mismos filtros Y el mismo alcance: comparten el `where`. */
	count(filters: ListGroupsDto, scope: AccessScope): Promise<number>;
	/**
	 * Grupos activos del alcance, sin paginar, para un selector.
	 *
	 * Lo consume el formulario de cursos al elegir audiencia. Sigue llevando
	 * alcance —a diferencia del catálogo de capacitadores, que es global—: un
	 * grupo es una lista nominal de una unidad, y verlo es leer a su gente.
	 */
	findActive(scope: AccessScope): Promise<Group[]>;
	/** Ids de los grupos activos a los que pertenece hoy la persona (§6.4). */
	findGroupIdsOfUser(userId: number): Promise<number[]>;
	findById(documentId: string, scope: AccessScope): Promise<Group | null>;
	create(data: CreateGroupData): Promise<Group>;
	update(
		documentId: string,
		dto: UpdateGroupDto,
		scope: AccessScope,
	): Promise<Group>;
	/** Soft-delete: marca `archivedAt` y libera el nombre dentro de la dependencia. */
	archive(documentId: string, scope: AccessScope): Promise<Group>;
	unarchive(documentId: string, scope: AccessScope): Promise<Group>;
	/** Miembros con su dependencia ACTUAL, de la alta más reciente a la más antigua. */
	listMembers(groupId: number): Promise<GroupMemberEntry[]>;
	/**
	 * Cuentas elegibles: internas, activas, de la dependencia DEL GRUPO y que no
	 * estén ya dentro.
	 *
	 * Recibe `dependencyId` y no un alcance a propósito: la pertenencia se decide
	 * por el grupo, nunca por quien busca.
	 */
	listCandidates(params: {
		groupId: number;
		dependencyId: number;
		search?: string;
	}): Promise<MemberCandidate[]>;
	/**
	 * Cuentas que SÍ pueden entrar a este grupo, de entre las pedidas.
	 *
	 * Devuelve solo las que cumplen —internas, activas y de la dependencia del
	 * grupo—, para que el servicio compare contra lo pedido y sepa cuántas
	 * sobraron sin tener que filtrar él mismo.
	 */
	findEligibleAccounts(params: {
		dependencyId: number;
		userDocumentIds: readonly string[];
	}): Promise<GroupMemberAccount[]>;
	addMembers(params: {
		groupId: number;
		userIds: readonly number[];
		addedById: number;
	}): Promise<void>;
	/** Baja de un miembro: DELETE, no soft-delete (§6.4). */
	removeMember(params: {
		groupId: number;
		userDocumentId: string;
	}): Promise<void>;
}
