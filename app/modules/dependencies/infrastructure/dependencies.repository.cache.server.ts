import type { AfterCommit } from "@/core/db.server";
import type { VersionedCache } from "@/shared/cache/versioned-cache";
import { DEPENDENCIES_CACHE_SCOPE } from "../domain/dependency.config";
import type { IDependencyRepository } from "../domain/dependency.repository";

type Dependencies = {
	inner: IDependencyRepository;
	aggregateCache: VersionedCache;
	afterCommit: AfterCommit;
};

/**
 * Este módulo no cachea nada propio: avisa a quien agrega datos de las
 * dependencias (el resumen de créditos) de que su nombre o su estado cambió.
 */
export const createDependencyRepositoryWithInvalidation = ({
	inner,
	aggregateCache,
	afterCommit,
}: Dependencies): IDependencyRepository => {
	const invalidated = async <T>(write: Promise<T>): Promise<T> => {
		const result = await write;
		await afterCommit(() =>
			aggregateCache.invalidate(DEPENDENCIES_CACHE_SCOPE),
		);
		return result;
	};

	return {
		...inner,
		create: (dto) => invalidated(inner.create(dto)),
		update: (documentId, dto) => invalidated(inner.update(documentId, dto)),
		archive: (documentId) => invalidated(inner.archive(documentId)),
		unarchive: (documentId) => invalidated(inner.unarchive(documentId)),
	};
};
