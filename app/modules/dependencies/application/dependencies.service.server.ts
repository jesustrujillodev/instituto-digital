import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { DEPENDENCY_LIST_DEFAULTS } from "../domain/dependency.config";
import {
	DependencyInactiveError,
	DependencyNotFoundError,
	HeadMustBeActiveError,
	HeadMustBelongToDependencyError,
} from "../domain/dependency.errors";
import type { IDependencyService } from "../domain/dependency.service";
import type {
	CreateDependencyDto,
	ListDependenciesDto,
	UpdateDependencyDto,
} from "../domain/dependency.types";

type Dependencies = {
	dependencyRepository: ICradle["dependencyRepository"];
	sessionMonitorService: ICradle["sessionMonitorService"];
	logger: ICradle["logger"];
};

export const createDependencyService = ({
	dependencyRepository,
	sessionMonitorService,
	logger,
}: Dependencies): IDependencyService => {
	const log = logger.child({ module: "dependencies" });

	// Toda operación pasa por el runner: es lo que convierte los errores que
	// lanzan el repositorio y valibot en la rama `success: false` del envelope, y
	// lo que registra los inesperados. Sin él, un throw se colaría hasta el loader
	// y el contrato dejaría de ser predecible.
	const run = createOperationRunner(log);

	/**
	 * Corta el acceso de quien acaba de cambiar de rol.
	 *
	 * Best-effort a propósito: la designación YA está confirmada y deshacerla
	 * sería peor que una ventana de sesión. Sin esto el cambio tardaría en
	 * notarse lo que dure su access token; con el epoch, corta en la siguiente
	 * petición. Un fallo se registra para poder rastrearlo, no se propaga.
	 */
	const revokeAccess = async (userIds: readonly number[]) => {
		for (const userId of userIds) {
			const revoked = await sessionMonitorService.revokeAllForUser(userId);

			if (!revoked.success) {
				log.warn("no se pudieron revocar las sesiones tras cambiar de rol", {
					userId,
					code: revoked.error.code,
				});
			}
		}
	};

	return {
		async list(filters: ListDependenciesDto) {
			return run("list", async () => {
				// En paralelo: la página y el total comparten filtros pero son consultas
				// independientes, y encadenarlas duplicaría la latencia del listado.
				const [data, total] = await Promise.all([
					dependencyRepository.findAll(filters),
					dependencyRepository.count(filters),
				]);

				return ok(data, {
					pagination: toPaginationMeta({
						page: filters.page ?? DEPENDENCY_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? DEPENDENCY_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},
		async listActive() {
			// Sin `pagination`: es un catálogo para un selector, no una página. Darle
			// una meta de paginación inventada mentiría sobre lo que se consultó.
			return run("listActive", async () =>
				ok(await dependencyRepository.findActive()),
			);
		},
		async findById(documentId: string) {
			return run("findById", async () => {
				const dependency = await dependencyRepository.findById(documentId);
				if (!dependency) throw new DependencyNotFoundError();

				return ok(dependency);
			});
		},
		async listCatalog() {
			return run("listCatalog", async () =>
				ok(await dependencyRepository.findCatalog()),
			);
		},
		async findByInternalId(id: number) {
			return run("findByInternalId", async () => {
				const dependency = await dependencyRepository.findByInternalId(id);
				if (!dependency) throw new DependencyNotFoundError();

				return ok(dependency);
			});
		},
		async listHeadCandidates(documentId: string) {
			return run("listHeadCandidates", async () => {
				// Se comprueba la dependencia antes de listar: sin esto, un documentId
				// inventado devolvería una lista vacía, que en pantalla se lee como "esta
				// dependencia no tiene personal" en vez de "no existe".
				const dependency = await dependencyRepository.findById(documentId);
				if (!dependency) throw new DependencyNotFoundError();

				return ok(await dependencyRepository.findHeadCandidates(dependency.id));
			});
		},
		async create(dto: CreateDependencyDto) {
			return run("create", async () =>
				ok(await dependencyRepository.create(dto)),
			);
		},
		async update(documentId: string, dto: UpdateDependencyDto) {
			return run("update", async () =>
				ok(await dependencyRepository.update(documentId, dto)),
			);
		},
		async archive(documentId: string) {
			// No borra nada: el efecto —no admite personal ni aparece como destino de
			// un cambio— lo imponen las reglas de `users`, y el historial se conserva.
			return run("archive", async () =>
				ok(await dependencyRepository.archive(documentId)),
			);
		},
		async unarchive(documentId: string) {
			return run("unarchive", async () =>
				ok(await dependencyRepository.unarchive(documentId)),
			);
		},
		async assignHead(documentId: string, userDocumentId: string) {
			return run("assignHead", async () => {
				const dependency = await dependencyRepository.findById(documentId);
				if (!dependency) throw new DependencyNotFoundError();
				// Una dependencia desactivada no recibe titular: sería darle quien la
				// administre a una unidad que ya no opera.
				if (dependency.archivedAt) throw new DependencyInactiveError();

				const candidate = await dependencyRepository.findMember(
					dependency.id,
					userDocumentId,
				);
				// null cubre dos casos que para quien pregunta son el mismo: la cuenta
				// no existe, o existe en otra dependencia. Decir cuál sería confirmar
				// la existencia de una cuenta ajena.
				if (!candidate) throw new HeadMustBelongToDependencyError();
				if (candidate.archivedAt) throw new HeadMustBeActiveError();

				const currentHead = await dependencyRepository.findHead(dependency.id);

				// Ya lo es: no se escribe nada ni se le cierra la sesión por un clic
				// repetido. Degradar y volver a promover a la misma persona dejaría el
				// mismo estado a cambio de echarla de la plataforma.
				if (currentHead?.id === candidate.id) return ok(dependency);

				await dependencyRepository.assignHead({
					dependencyId: dependency.id,
					candidateUserId: candidate.id,
					currentHeadUserId: currentHead?.id ?? null,
				});

				// Fuera del commit y para los DOS: el relevado pierde la gestión y el
				// promovido la gana, y ninguno de los dos cambios se nota mientras siga
				// vivo el access token que firmó el rol anterior.
				await revokeAccess(
					currentHead ? [currentHead.id, candidate.id] : [candidate.id],
				);

				return ok(dependency);
			});
		},
	};
};
