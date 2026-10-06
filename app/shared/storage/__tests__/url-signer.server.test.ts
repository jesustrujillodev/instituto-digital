import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import type { ThrottledLog } from "../../logging/throttled-log";
import type { SignedUrlPolicy } from "../signed-url.policy";
import { createMemorySignedUrlCache } from "../signed-url-cache.memory";
import type { SignedUrlCache } from "../signed-url-cache.port";
import type { IStorageProvider } from "../storage.port";
import { createUrlSignerFromEnv } from "../url-signer.factory.server";
import type { SignRequest } from "../url-signer.port";
import { createUrlSigner } from "../url-signer.server";

const POLICY: SignedUrlPolicy = { signTtlS: 6 * 3600, minRemainingS: 4 * 3600 };

const requestOf = (
	key: string,
	disposition: SignRequest["disposition"] = "inline",
): SignRequest => ({ bucket: "documentos", key, disposition, policy: POLICY });

const createHarness = (
	options: { cache?: SignedUrlCache; failingCache?: boolean } = {},
) => {
	let now = 1_800_000_000_000;
	let serial = 0;
	const calls = {
		signed: [] as { key: string; ttl?: number; disposition?: string }[],
		lookups: 0,
		writes: 0,
		warnings: [] as string[],
	};
	const storageProvider = {
		getPresignedUrl: async (
			_bucket: string,
			key: string,
			ttl?: number,
			opts?: { disposition?: string },
		) => {
			calls.signed.push({ key, ttl, disposition: opts?.disposition });
			return `https://bucket.example/${key}?sig=${++serial}`;
		},
	} as unknown as IStorageProvider;
	const inner = options.cache ?? createMemorySignedUrlCache({ now: () => now });
	const cache: SignedUrlCache = {
		getMany: async (keys) => {
			calls.lookups += 1;
			if (options.failingCache) throw new Error("Connection is closed.");
			return inner.getMany(keys);
		},
		setMany: async (entries) => {
			calls.writes += 1;
			if (options.failingCache) throw new Error("Connection is closed.");
			return inner.setMany(entries);
		},
	};
	const log = {
		warn: (key: string) => calls.warnings.push(key),
	} as unknown as ThrottledLog;

	return {
		signer: createUrlSigner({ storageProvider, cache, log, now: () => now }),
		calls,
		advance: (ms: number) => {
			now += ms;
		},
	};
};

describe("createUrlSigner", () => {
	test("la segunda petición reutiliza la URL sin volver a firmar", async () => {
		const { signer, calls } = createHarness();

		const [first] = await signer.signMany([requestOf("a.pdf")]);
		const [second] = await signer.signMany([requestOf("a.pdf")]);

		expect(second).toEqual(first);
		expect(calls.signed).toHaveLength(1);
	});

	test("firma con la vida y la disposición de la política", async () => {
		const { signer, calls } = createHarness();

		const [entry] = await signer.signMany([requestOf("a.pdf", "attachment")]);

		expect(calls.signed).toEqual([
			{ key: "a.pdf", ttl: POLICY.signTtlS, disposition: "attachment" },
		]);
		expect(entry.expiresAt).toBeGreaterThan(0);
	});

	// Quien abre un video largo necesita que la firma le dure: con menos margen
	// del que pide la política, se firma una nueva.
	test("una URL con poco margen ya no se entrega", async () => {
		const cache = createMemorySignedUrlCache({ now: () => 0 });
		const { signer, calls, advance } = createHarness({ cache });

		await signer.signMany([requestOf("a.pdf")]);
		advance((POLICY.signTtlS - POLICY.minRemainingS + 1) * 1000);
		await signer.signMany([requestOf("a.pdf")]);

		expect(calls.signed).toHaveLength(2);
	});

	test("un lote cuesta una lectura y una escritura de la caché", async () => {
		const { signer, calls } = createHarness();

		await signer.signMany([
			requestOf("a.pdf"),
			requestOf("a.pdf", "attachment"),
			requestOf("b.pdf"),
		]);

		expect(calls.lookups).toBe(1);
		expect(calls.writes).toBe(1);
	});

	test("lo repetido en el lote se firma una vez y responde en su lugar", async () => {
		const { signer, calls } = createHarness();

		const urls = await signer.signMany([
			requestOf("a.pdf"),
			requestOf("b.pdf"),
			requestOf("a.pdf"),
		]);

		expect(calls.signed.map((call) => call.key)).toEqual(["a.pdf", "b.pdf"]);
		expect(urls[0]).toEqual(urls[2]);
		expect(urls[1].url).toContain("b.pdf");
	});

	test("con todo en caché no escribe nada", async () => {
		const { signer, calls } = createHarness();
		await signer.signMany([requestOf("a.pdf")]);

		await signer.signMany([requestOf("a.pdf")]);

		expect(calls.writes).toBe(1);
	});

	test("con la caché caída firma directo y deja constancia", async () => {
		const { signer, calls } = createHarness({ failingCache: true });

		const [entry] = await signer.signMany([requestOf("a.pdf")]);

		expect(entry.url).toContain("a.pdf");
		expect(calls.signed).toHaveLength(1);
		expect(calls.warnings).toEqual(["signed-url-cache", "signed-url-cache"]);
	});

	test("un lote vacío no toca nada", async () => {
		const { signer, calls } = createHarness();

		expect(await signer.signMany([])).toEqual([]);
		expect(calls.lookups).toBe(0);
	});
});

describe("createUrlSignerFromEnv", () => {
	const storageProvider = {
		getPresignedUrl: async (_bucket: string, key: string) =>
			`https://bucket.example/${key}?sig=${Math.random()}`,
	} as unknown as IStorageProvider;
	const logger = { warn: () => {} } as unknown as Logger;

	test.each([
		["sin Redis, en el proceso", null],
		[
			"con Redis, entre instancias",
			new RedisMock({ keyPrefix: "usf:" }) as unknown as Redis,
		],
	])("%s reutiliza la firma", async (_name, redis) => {
		const signer = createUrlSignerFromEnv({ redis, storageProvider, logger });

		const [first] = await signer.signMany([requestOf("a.pdf")]);
		const [second] = await signer.signMany([requestOf("a.pdf")]);

		expect(second.url).toBe(first.url);
	});
});
