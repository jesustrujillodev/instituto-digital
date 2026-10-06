import type { AfterCommit } from "@/core/db.server";
import { DEPENDENCIES_CACHE_SCOPE } from "@/modules/dependencies/domain/dependency.config";
import type { VersionedCache } from "@/shared/cache/versioned-cache";
import {
	CREDITS_CACHE_SCOPE,
	CREDITS_SUMMARY_CACHE,
} from "../domain/credit.config";
import type { ICreditRepository } from "../domain/credit.repository";
import { dependencyCreditRowsSchema } from "../domain/credit.validators";

type Dependencies = {
	inner: ICreditRepository;
	aggregateCache: VersionedCache;
	afterCommit: AfterCommit;
};

/**
 * Decorador con caché del resumen por dependencia. Las escrituras invalidan
 * tras el commit de la transacción que las contiene (las hace `teaching` al
 * finalizar o corregir un curso), nunca antes.
 */
export const createCachedCreditRepository = ({
	inner,
	aggregateCache,
	afterCommit,
}: Dependencies): ICreditRepository => {
	const invalidateIf = async (changed: boolean) => {
		if (changed) {
			await afterCommit(() => aggregateCache.invalidate(CREDITS_CACHE_SCOPE));
		}
	};

	return {
		...inner,

		summarizeByDependency(fiscalYear) {
			return aggregateCache.getOrCompute(
				{
					...CREDITS_SUMMARY_CACHE,
					key: String(fiscalYear),
					dependsOn: [CREDITS_CACHE_SCOPE, DEPENDENCIES_CACHE_SCOPE],
					schema: dependencyCreditRowsSchema,
				},
				() => inner.summarizeByDependency(fiscalYear),
			);
		},

		async grant(candidates, context) {
			await inner.grant(candidates, context);
			await invalidateIf(candidates.length > 0);
		},

		async restore(userIds, context) {
			await inner.restore(userIds, context);
			await invalidateIf(userIds.length > 0);
		},

		async revoke(userIds, context) {
			await inner.revoke(userIds, context);
			await invalidateIf(userIds.length > 0);
		},
	};
};
