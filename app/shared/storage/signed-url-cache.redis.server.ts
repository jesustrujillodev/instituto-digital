import type { Redis } from "ioredis";
import * as v from "valibot";
import type { SignedUrl } from "./signed-url.policy";
import type { SignedUrlCache } from "./signed-url-cache.port";

const signedUrlSchema = v.object({ url: v.string(), expiresAt: v.number() });

/** Lo que no se puede leer cuenta como ausente: se vuelve a firmar. */
const parse = (raw: string | null): SignedUrl | null => {
	if (raw === null) return null;
	try {
		const result = v.safeParse(signedUrlSchema, JSON.parse(raw));
		return result.success ? result.output : null;
	} catch {
		return null;
	}
};

/** Un MGET para leer y un pipeline para escribir: un viaje cada uno, sean cuantas sean. */
export const createRedisSignedUrlCache = ({
	redis,
}: {
	redis: Redis;
}): SignedUrlCache => ({
	async getMany(keys) {
		if (keys.length === 0) return [];
		const values = await redis.mget(...keys);
		return values.map(parse);
	},
	async setMany(entries) {
		if (entries.length === 0) return;
		const pipeline = redis.pipeline();
		for (const { key, value, ttlMs } of entries) {
			pipeline.set(key, JSON.stringify(value), "PX", ttlMs);
		}
		const results = await pipeline.exec();
		const failed = results?.find(([error]) => error)?.[0];
		if (failed) throw failed;
	},
});
