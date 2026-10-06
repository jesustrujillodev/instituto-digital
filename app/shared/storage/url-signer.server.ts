import type { ThrottledLog } from "../logging/throttled-log";
import { signedUrlKey } from "../redis/redis.keys.server";
import { cacheTtlMsOf, isServable, type SignedUrl } from "./signed-url.policy";
import type { SignedUrlCache } from "./signed-url-cache.port";
import type { IStorageProvider } from "./storage.port";
import type { SignRequest, UrlSigner } from "./url-signer.port";

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/**
 * Un viaje a la caché para todo el lote y una firma por cada URL que falte.
 * Si la caché falla se firma todo: lo único que se pierde es la reutilización.
 */
export const createUrlSigner = ({
	storageProvider,
	cache,
	log,
	now = Date.now,
}: {
	storageProvider: IStorageProvider;
	cache: SignedUrlCache;
	log: ThrottledLog;
	now?: () => number;
}): UrlSigner => ({
	async signMany(requests) {
		if (requests.length === 0) return [];

		const unique = new Map<string, SignRequest>();
		for (const request of requests) {
			unique.set(
				signedUrlKey({ ...request, signTtlS: request.policy.signTtlS }),
				request,
			);
		}
		const keys = [...unique.keys()];

		const cached = await cache.getMany(keys).catch((error: unknown) => {
			log.warn("signed-url-cache", "signed url cache unavailable", {
				message: errorMessage(error),
			});
			return keys.map(() => null);
		});

		const at = now();
		const resolved = new Map<string, SignedUrl>();
		const misses: { key: string; request: SignRequest }[] = [];
		keys.forEach((key, index) => {
			const request = unique.get(key) as SignRequest;
			const entry = cached[index];
			if (entry && isServable(entry, at, request.policy)) {
				resolved.set(key, entry);
			} else {
				misses.push({ key, request });
			}
		});

		const fresh = await Promise.all(
			misses.map(async ({ key, request }) => {
				const url = await storageProvider.getPresignedUrl(
					request.bucket,
					request.key,
					request.policy.signTtlS,
					{ disposition: request.disposition },
				);
				const value = { url, expiresAt: at + request.policy.signTtlS * 1000 };
				resolved.set(key, value);
				return { key, value, ttlMs: cacheTtlMsOf(request.policy) };
			}),
		);
		if (fresh.length > 0) {
			await cache.setMany(fresh).catch((error: unknown) => {
				log.warn("signed-url-cache", "signed url cache unavailable", {
					message: errorMessage(error),
				});
			});
		}

		return requests.map(
			(request) =>
				resolved.get(
					signedUrlKey({ ...request, signTtlS: request.policy.signTtlS }),
				) as SignedUrl,
		);
	},
});
