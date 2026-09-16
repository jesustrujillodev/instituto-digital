import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { type AccessScope, resolveScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { canManageGroups } from "../domain/group.access";
import { GROUP_LIST_DEFAULTS } from "../domain/group.config";
import {
	GroupDependencyInactiveError,
	GroupForbiddenScopeError,
	GroupNotFoundError,
	MemberOutOfDependencyError,
} from "../domain/group.errors";
import type { IGroupService } from "../domain/group.service";
import type {
	CreateGroupDto,
	Group,
	ListGroupsDto,
	UpdateGroupDto,
} from "../domain/group.types";

type Dependencies = {
	groupRepository: ICradle["groupRepository"];
	dependencyRepository: ICradle["dependencyRepository"];
	logger: ICradle["logger"];
};

export const createGroupService = ({
	groupRepository,
	dependencyRepository,
	logger,
}: Dependencies): IGroupService => {
	const log = logger.child({ module: "groups" });
	const run = createOperationRunner(log);

	/**
	 * El alcance de dependencia con el que se escribe, o corte.
	 *
	 * Un grupo pertenece forzosamente a una unidad: un alcance global no sabría a
	 * cuál asignarlo y uno propio no administra nada. Es lo que deja al
	 * superadministrador consultar grupos ajenos sin poder tocarlos.
	 */
	const requireWriteScope = (actor: AuthContext): number => {
		const scope = resolveScope(actor);

		if (!canManageGroups(scope)) throw new GroupForbiddenScopeError();

		return scope.dependencyId;
	};

	/** El grupo, ya comprobado contra el alcance de quien lo pide. */
	const requireGroup = async (
		documentId: string,
		scope: AccessScope,
	): Promise<Group> => {
		const group = await groupRepository.findById(documentId, scope);
		if (!group) throw new GroupNotFoundError();

		return group;
	};

	/** Un grupo que se va a escribir: alcance de dependencia y existencia. */
	const requireWritableGroup = async (
		documentId: string,
		actor: AuthContext,
	): Promise<Group> => {
		requireWriteScope(actor);

		return requireGroup(documentId, resolveScope(actor));
	};

	return {
		async list(filters: ListGroupsDto, scope: AccessScope) {
			return run("list", async () => {
				// En paralelo: la página y el total comparten filtros pero son
				// consultas independientes, y encadenarlas duplicaría la latencia.
				const [data, total] = await Promise.all([
					groupRepository.findAll(filters, scope),
					groupRepository.count(filters, scope),
				]);

				return ok(data, {
					pagination: toPaginationMeta({
						page: filters.page ?? GROUP_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? GROUP_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},
		async findById(documentId: string, scope: AccessScope) {
			return run("findById", async () =>
				ok(await requireGroup(documentId, scope)),
			);
		},
		async listMembers(documentId: string, scope: AccessScope) {
			return run("listMembers", async () => {
				const group = await requireGroup(documentId, scope);

				return ok(await groupRepository.listMembers(group.id));
			});
		},
		async listCandidates(
			documentId: string,
			search: string | undefined,
			scope: AccessScope,
		) {
			return run("listCandidates", async () => {
				const group = await requireGroup(documentId, scope);

				return ok(
					await groupRepository.listCandidates({
						groupId: group.id,
						// La dependencia es la DEL GRUPO. Que hoy coincida con la de quien
						// busca no es motivo para escribirlo con el alcance del actor: el
						// día que el superadministrador administre grupos, esa versión
						// abriría el padrón entero y esta sigue siendo correcta.
						dependencyId: group.dependencyId,
						search,
					}),
				);
			});
		},
		async create(dto: CreateGroupDto, actor: AuthContext) {
			return run("create", async () => {
				const dependencyId = requireWriteScope(actor);

				// Una dependencia desactivada no admite grupos nuevos, igual que no
				// admite personal.
				const dependency =
					await dependencyRepository.findByInternalId(dependencyId);
				if (!dependency) throw new GroupNotFoundError();
				if (dependency.archivedAt) throw new GroupDependencyInactiveError();

				return ok(await groupRepository.create({ ...dto, dependencyId }));
			});
		},
		async update(documentId: string, dto: UpdateGroupDto, actor: AuthContext) {
			return run("update", async () => {
				await requireWritableGroup(documentId, actor);

				return ok(
					await groupRepository.update(documentId, dto, resolveScope(actor)),
				);
			});
		},
		async archive(documentId: string, actor: AuthContext) {
			return run("archive", async () => {
				await requireWritableGroup(documentId, actor);

				// No borra nada: libera el nombre dentro de la dependencia y conserva
				// a sus miembros.
				return ok(
					await groupRepository.archive(documentId, resolveScope(actor)),
				);
			});
		},
		async unarchive(documentId: string, actor: AuthContext) {
			return run("unarchive", async () => {
				await requireWritableGroup(documentId, actor);

				return ok(
					await groupRepository.unarchive(documentId, resolveScope(actor)),
				);
			});
		},
		async addMembers(
			documentId: string,
			userDocumentIds: readonly string[],
			actor: AuthContext,
		) {
			return run("addMembers", async () => {
				const group = await requireWritableGroup(documentId, actor);

				const eligible = await groupRepository.findEligibleAccounts({
					dependencyId: group.dependencyId,
					userDocumentIds,
				});

				// El lote se rechaza entero si alguna cuenta no cumple: dejar dentro a
				// las válidas y callar el resto convertiría un error en una lista
				// silenciosamente incompleta. Un externo, un archivado y alguien de
				// otra dependencia caen todos aquí — las tres condiciones viven en el
				// mismo `where`.
				if (eligible.length !== userDocumentIds.length) {
					throw new MemberOutOfDependencyError();
				}

				await groupRepository.addMembers({
					groupId: group.id,
					userIds: eligible.map((account) => account.id),
					addedById: actor.userId,
				});

				return ok(await requireGroup(documentId, resolveScope(actor)));
			});
		},
		async removeMember(
			documentId: string,
			userDocumentId: string,
			actor: AuthContext,
		) {
			return run("removeMember", async () => {
				const group = await requireWritableGroup(documentId, actor);

				await groupRepository.removeMember({
					groupId: group.id,
					userDocumentId,
				});

				return ok(await requireGroup(documentId, resolveScope(actor)));
			});
		},
	};
};
