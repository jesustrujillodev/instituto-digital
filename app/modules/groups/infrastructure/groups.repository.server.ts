import { Prisma } from "@prisma/client";
import type { AccessScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import { groupScopeWhere, groupScopeWriteWhere } from "../domain/group.access";
import {
	GROUP_LIST_DEFAULTS,
	MEMBER_CANDIDATES_LIMIT,
} from "../domain/group.config";
import {
	DuplicateGroupNameError,
	GroupNotFoundError,
	MemberAlreadyInGroupError,
} from "../domain/group.errors";
import { toDomain } from "../domain/group.mapper";
import type { IGroupRepository } from "../domain/group.repository";
import type {
	CreateGroupData,
	ListGroupsDto,
	UpdateGroupDto,
} from "../domain/group.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const SEARCHABLE_FIELDS = ["name", "description"] as const;

const CANDIDATE_SEARCHABLE_FIELDS = ["firstName", "lastName", "email"] as const;

const GROUP_SELECT = {
	id: true,
	documentId: true,
	dependencyId: true,
	name: true,
	description: true,
	archivedAt: true,
	createdAt: true,
	updatedAt: true,
	dependency: { select: { name: true } },
	_count: { select: { members: true } },
} as const;

// ── Traducción de errores de Prisma ───────────────────────────────────────────
const translatePrismaError = (error: unknown): never => {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002") {
			// Dos índices únicos pueden romperse: el nombre dentro de la dependencia
			// y la PK compuesta de `group_members`. El mensaje es distinto en cada
			// caso, así que se distinguen por `meta.target`.
			const target = String(error.meta?.target ?? "");

			if (target.includes("name_per_dependency")) {
				throw new DuplicateGroupNameError();
			}

			throw new MemberAlreadyInGroupError();
		}
		if (error.code === "P2025") throw new GroupNotFoundError();
	}
	throw error;
};

const toFilters = (dto: ListGroupsDto, scope: AccessScope) => {
	const archivedFilter =
		dto.status === "all"
			? {}
			: dto.status === "archived"
				? { archivedAt: { not: null } }
				: { archivedAt: null };

	return {
		// Va PRIMERO para que ninguna clave de abajo pueda sobrescribirlo por
		// accidente al añadir un filtro nuevo.
		...groupScopeWhere(scope),
		// Se SUMA al alcance: pedir una dependencia distinta de la propia no casa
		// con el `dependencyId` del alcance y no devuelve nada.
		...(dto.dependency && { dependency: { documentId: dto.dependency } }),
		...archivedFilter,
		...(dto.search && {
			OR: SEARCHABLE_FIELDS.map((field) => ({
				[field]: { contains: dto.search, mode: Prisma.QueryMode.insensitive },
			})),
		}),
	};
};

const toOrderBy = (dto: ListGroupsDto) => ({
	[dto.sortBy ?? "name"]: dto.sortDir ?? "asc",
});

/**
 * `where` de una escritura: la clave única MÁS el alcance.
 *
 * Un alcance que no alcanza nada se corta aquí, antes de tocar la base, con el
 * mismo error que daría una fila fuera de alcance — el `where` de un `update`
 * exige igualdad sobre la clave única y no admite `IN ()`.
 */
const writeWhere = (documentId: string, scope: AccessScope) => {
	const filter = groupScopeWriteWhere(scope);

	if (filter === null) throw new GroupNotFoundError();

	return { documentId, ...filter };
};

export const createGroupRepository = ({
	prisma,
}: Dependencies): IGroupRepository => {
	return {
		async findAll(filters: ListGroupsDto, scope: AccessScope) {
			const page = filters.page ?? GROUP_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? GROUP_LIST_DEFAULTS.pageSize;

			const groups = await prisma.group.findMany({
				where: toFilters(filters, scope),
				orderBy: toOrderBy(filters),
				skip: (page - 1) * pageSize,
				take: pageSize,
				select: GROUP_SELECT,
			});

			return groups.map(toDomain);
		},
		async count(filters: ListGroupsDto, scope: AccessScope) {
			return prisma.group.count({ where: toFilters(filters, scope) });
		},
		async findById(documentId: string, scope: AccessScope) {
			// `findFirst` y no `findUnique`: hace falta combinar la clave única con
			// el filtro del alcance, y fuera de alcance debe devolver null igual que
			// un documentId inexistente.
			const group = await prisma.group.findFirst({
				where: { documentId, ...groupScopeWhere(scope) },
				select: GROUP_SELECT,
			});
			return group ? toDomain(group) : null;
		},
		async create(data: CreateGroupData) {
			try {
				const group = await prisma.group.create({
					data,
					select: GROUP_SELECT,
				});
				return toDomain(group);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async update(documentId: string, dto: UpdateGroupDto, scope: AccessScope) {
			try {
				const group = await prisma.group.update({
					where: writeWhere(documentId, scope),
					data: dto,
					select: GROUP_SELECT,
				});
				return toDomain(group);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async archive(documentId: string, scope: AccessScope) {
			try {
				const group = await prisma.group.update({
					where: writeWhere(documentId, scope),
					data: { archivedAt: new Date() },
					select: GROUP_SELECT,
				});
				return toDomain(group);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async unarchive(documentId: string, scope: AccessScope) {
			try {
				const group = await prisma.group.update({
					where: writeWhere(documentId, scope),
					data: { archivedAt: null },
					select: GROUP_SELECT,
				});
				return toDomain(group);
			} catch (error) {
				return translatePrismaError(error);
			}
		},
		async listMembers(groupId: number) {
			const members = await prisma.groupMember.findMany({
				where: { groupId },
				orderBy: { addedAt: "desc" },
				select: {
					addedAt: true,
					user: {
						select: {
							documentId: true,
							firstName: true,
							lastName: true,
							email: true,
							dependency: { select: { name: true } },
						},
					},
				},
			});

			return members.map(({ addedAt, user }) => ({
				userDocumentId: user.documentId,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				dependencyName: user.dependency?.name ?? null,
				addedAt,
			}));
		},
		async listCandidates({ groupId, dependencyId, search }) {
			const candidates = await prisma.user.findMany({
				where: {
					// La dependencia es la DEL GRUPO, nunca la de quien busca.
					dependencyId,
					type: "INTERNAL",
					archivedAt: null,
					groupMemberships: { none: { groupId } },
					...(search && {
						OR: CANDIDATE_SEARCHABLE_FIELDS.map((field) => ({
							[field]: {
								contains: search,
								mode: Prisma.QueryMode.insensitive,
							},
						})),
					}),
				},
				orderBy: [{ firstName: "asc" }, { email: "asc" }],
				take: MEMBER_CANDIDATES_LIMIT,
				select: {
					documentId: true,
					firstName: true,
					lastName: true,
					email: true,
				},
			});

			return candidates;
		},
		async findEligibleAccounts({ dependencyId, userDocumentIds }) {
			// Las tres condiciones van en el `where`: así el servicio solo tiene que
			// contar cuántas volvieron, sin repetir la regla al comparar.
			return prisma.user.findMany({
				where: {
					documentId: { in: [...userDocumentIds] },
					dependencyId,
					type: "INTERNAL",
					archivedAt: null,
				},
				select: { id: true, documentId: true },
			});
		},
		async addMembers({ groupId, userIds, addedById }) {
			try {
				await prisma.groupMember.createMany({
					data: userIds.map((userId) => ({ groupId, userId, addedById })),
				});
			} catch (error) {
				translatePrismaError(error);
			}
		},
		async removeMember({ groupId, userDocumentId }) {
			// `deleteMany` y no `delete`: la PK compuesta habla en ids internos y
			// aquí llega el público, así que la baja se expresa como predicado. Que
			// no borre nada no es un error — la persona ya no estaba.
			await prisma.groupMember.deleteMany({
				where: { groupId, user: { documentId: userDocumentId } },
			});
		},
	};
};
