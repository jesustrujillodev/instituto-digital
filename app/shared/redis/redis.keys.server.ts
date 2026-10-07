import { createHash } from "node:crypto";

// Formato `dominio:v<esquema>:...`. Cambiar la forma de un valor es subir la
// versión: las claves viejas mueren solas por su TTL. `REDIS_KEY_PREFIX` lo
// antepone ioredis a cada clave, pero no a los canales de pub/sub.

const digest = (value: string): string =>
	createHash("sha256").update(value).digest("base64url").slice(0, 32);

/** El primer segmento queda legible para operar; el email o la IP nunca van en claro. */
export const rateLimitKey = (logicalKey: string): string =>
	`rl:v1:${logicalKey.split(":")[0]}:${digest(logicalKey)}`;

export const signedUrlKey = (parts: {
	bucket: string;
	key: string;
	disposition: string;
	signTtlS: number;
}): string =>
	`su:v1:${digest(
		JSON.stringify([
			parts.bucket,
			parts.key,
			parts.disposition,
			parts.signTtlS,
		]),
	)}`;

export const invalidationChannel = (keyPrefix: string, channel: string) =>
	`${keyPrefix}inv:v1:${channel}`;

/** La versión de un alcance no caduca: perderla solo provoca un fallo de caché. */
export const cacheVersionKey = (scope: string): string => `vc:v1:ver:${scope}`;

export const cachePayloadKey = (name: string, key: string): string =>
	`vc:v1:val:${name}:${digest(key)}`;
