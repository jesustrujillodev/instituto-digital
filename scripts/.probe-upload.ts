import { env } from "@/core/env.server";
import { createConsoleLogger } from "@/shared/logging/logger.console";
import { buildObjectKey } from "@/shared/storage/object-key";
import { createStorageProviderFromEnv } from "@/shared/storage/storage.factory";
import { bucketForKey } from "@/shared/storage/storage.policy";

const logger = createConsoleLogger({ level: "error" });
const provider = createStorageProviderFromEnv(env, logger);

const key = buildObjectKey("documentos/lecciones", "probe.mp4");
const bucket = bucketForKey(key, {
	defaultBucket: env.STORAGE_BUCKET_NAME ?? "",
	publicBucket: env.STORAGE_PUBLIC_BUCKET_NAME ?? null,
});

console.log("key    :", key);
console.log("bucket :", bucket);

const url = await provider.getUploadUrl(bucket, key, {
	contentType: "video/mp4",
	expiresInSeconds: 900,
});

const parsed = new URL(url);
console.log("host   :", parsed.hostname);
console.log("path   :", parsed.pathname);
console.log("firmado:", parsed.searchParams.get("X-Amz-SignedHeaders"));

const res = await fetch(url, {
	method: "PUT",
	headers: { "Content-Type": "video/mp4" },
	body: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
});

console.log("PUT    :", res.status, res.statusText);
if (!res.ok) console.log(await res.text());
else {
	const stat = await provider.statObject(bucket, key);
	console.log("stat   :", stat);
	await provider.deleteFile(bucket, key);
	console.log("limpiado");
}
