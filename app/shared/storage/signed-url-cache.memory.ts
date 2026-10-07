import type { SignedUrl } from "./signed-url.policy";
import type { SignedUrlCache } from "./signed-url-cache.port";

/** Sin Redis: la misma URL se reutiliza dentro del proceso. LRU con tope. */
export const createMemorySignedUrlCache = ({
	maxEntries = 5_000,
	now = Date.now,
}: {
	maxEntries?: number;
	now?: () => number;
} = {}): SignedUrlCache => {
	const entries = new Map<string, { value: SignedUrl; until: number }>();

	return {
		async getMany(keys) {
			const at = now();
			return keys.map((key) => {
				const entry = entries.get(key);
				if (!entry) return null;
				entries.delete(key);
				if (entry.until <= at) return null;
				entries.set(key, entry);
				return entry.value;
			});
		},
		async setMany(batch) {
			const at = now();
			for (const { key, value, ttlMs } of batch) {
				entries.delete(key);
				entries.set(key, { value, until: at + ttlMs });
			}
			for (const oldest of entries.keys()) {
				if (entries.size <= maxEntries) break;
				entries.delete(oldest);
			}
		},
	};
};
