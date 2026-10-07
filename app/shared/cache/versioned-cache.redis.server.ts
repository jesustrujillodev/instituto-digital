import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import * as v from "valibot";
import type { ThrottledLog } from "../logging/throttled-log";
import { cachePayloadKey, cacheVersionKey } from "../redis/redis.keys.server";
import type { CachedRead, VersionedCache } from "./versioned-cache";

const payloadSchema = v.object({ v: v.array(v.string()), d: v.unknown() });

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const sameVersions = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((version, index) => version === b[index]);

/**
 * Lectura: un MGET de las versiones y del valor. Es un acierto solo si el valor
 * se calculó con las versiones vigentes. Fallo: se calcula con las versiones
 * leídas ANTES de consultar, de modo que una invalidación ocurrida mientras
 * tanto deja escrito un valor que la siguiente lectura descarta.
 */
export const createRedisVersionedCache = ({
	redis,
	log,
	token = randomUUID,
}: {
	redis: Redis;
	log: ThrottledLog;
	token?: () => string;
}): VersionedCache => {
	const warn = (message: string, error: unknown) =>
		log.warn("versioned-cache", message, { message: errorMessage(error) });

	/**
	 * Un alcance sin versión (nunca invalidado, o expulsado por memoria) la
	 * recibe aquí. Nunca se escribe un valor contra una versión vacía: si la
	 * versión desapareciera, ese valor viejo volvería a parecer vigente.
	 */
	const versionsOf = async (
		keys: readonly string[],
		read: readonly (string | null)[],
	): Promise<string[]> => {
		if (read.every((version) => version !== null)) return read as string[];

		const pipeline = redis.pipeline();
		keys.forEach((key, index) => {
			if (read[index] === null) pipeline.set(key, token(), "NX");
		});
		await pipeline.exec();
		return (await redis.mget(...keys)).map((version) => version ?? "");
	};

	return {
		async getOrCompute<T>(read: CachedRead<T>, compute: () => Promise<T>) {
			const versionKeys = read.dependsOn.map(cacheVersionKey);
			const payloadKey = cachePayloadKey(read.name, read.key);

			let versions: string[];
			try {
				const values = await redis.mget(...versionKeys, payloadKey);
				const raw = values[values.length - 1];
				const current = values.slice(0, -1);
				const hit = raw ? parseHit(raw, current, read) : null;
				if (hit) return hit.value;
				versions = await versionsOf(versionKeys, current);
			} catch (error) {
				warn("versioned cache read failed", error);
				return compute();
			}

			const value = await compute();
			try {
				await redis.set(
					payloadKey,
					JSON.stringify({ v: versions, d: value }),
					"EX",
					read.ttlS,
				);
			} catch (error) {
				warn("versioned cache write failed", error);
			}
			return value;
		},

		async invalidate(scope) {
			try {
				await redis.set(cacheVersionKey(scope), token());
			} catch (error) {
				warn("versioned cache invalidation failed", error);
			}
		},
	};
};

const parseHit = <T>(
	raw: string,
	versions: readonly (string | null)[],
	read: CachedRead<T>,
): { value: T } | null => {
	if (versions.some((version) => version === null)) return null;
	try {
		const payload = v.safeParse(payloadSchema, JSON.parse(raw));
		if (
			!payload.success ||
			!sameVersions(payload.output.v, versions as string[])
		) {
			return null;
		}
		const value = v.safeParse(read.schema, payload.output.d);
		return value.success ? { value: value.output } : null;
	} catch {
		return null;
	}
};
