import { describe, expect, test } from "vitest";
import type { InvalidationBus } from "@/shared/cache/invalidation-bus";
import { createMemoryInvalidationBus } from "@/shared/cache/invalidation-bus.memory";
import type { LogData, Logger } from "@/shared/logging/logger";
import type {
	SecuritySnapshot,
	SecurityStateRepository,
} from "../../domain/security-state.repository";
import {
	createCachedSecurityStateRepository,
	SECURITY_STATE_INVALIDATION_CHANNEL,
} from "../security-state.cache.server";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const snapshotOf = (tokensValidAfter: Date): SecuritySnapshot => ({
	tokensValidAfter,
	lockdownAt: null,
	lockdownScope: null,
	lockdownReason: null,
	lockdownBy: null,
	userTokensValidAfter: new Map(),
	readAt: new Date(),
});

type Entry = { level: string; message: string; data?: LogData };

const createSpyLogger = () => {
	const entries: Entry[] = [];
	const logger: Logger = {
		debug: (message, data) => entries.push({ level: "debug", message, data }),
		info: (message, data) => entries.push({ level: "info", message, data }),
		warn: (message, data) => entries.push({ level: "warn", message, data }),
		error: (message, data) => entries.push({ level: "error", message, data }),
		child: () => logger,
	};
	return { logger, entries };
};

/** `inner` falso con contador de llamadas y un fallo programable. */
const createFakeInner = () => {
	const calls = {
		get: 0,
		revokeAllTokens: 0,
		revokeUserTokens: 0,
		lockdown: 0,
		lift: 0,
	};
	let current = snapshotOf(new Date("2026-07-30T12:00:00.000Z"));
	let failure: Error | null = null;

	const inner: SecurityStateRepository = {
		async get() {
			calls.get += 1;
			if (failure) throw failure;
			return current;
		},
		async revokeAllTokens() {
			calls.revokeAllTokens += 1;
			current = snapshotOf(new Date());
			return current;
		},
		async revokeUserTokens() {
			calls.revokeUserTokens += 1;
		},
		async lockdown() {
			calls.lockdown += 1;
			current = snapshotOf(new Date());
			return { snapshot: current, purgedSessions: 4 };
		},
		async lift() {
			calls.lift += 1;
			current = snapshotOf(new Date());
			return current;
		},
	};

	return {
		inner,
		calls,
		setSnapshot: (next: SecuritySnapshot) => {
			current = next;
		},
		failWith: (error: Error | null) => {
			failure = error;
		},
	};
};

describe("createCachedSecurityStateRepository", () => {
	test("serves from cache within the TTL — a single read of inner", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 10_000,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		const first = await cache.get();
		const second = await cache.get();
		const third = await cache.get();

		expect(fake.calls.get).toBe(1);
		expect(second).toBe(first);
		expect(third).toBe(first);
	});

	test("collapses concurrent reads into one call to inner", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 10_000,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		await Promise.all([cache.get(), cache.get(), cache.get(), cache.get()]);

		expect(fake.calls.get).toBe(1);
	});

	test("refreshes once the TTL expires", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 5,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		await cache.get();
		const moved = snapshotOf(new Date("2026-07-30T13:00:00.000Z"));
		fake.setSnapshot(moved);
		await sleep(20);
		const after = await cache.get();

		expect(fake.calls.get).toBe(2);
		expect(after.tokensValidAfter).toEqual(moved.tokensValidAfter);
	});

	// docs/auth/01 §8.2 — si el store cae con la caché caliente, el corte que
	// hubiera sigue en pie. Devolver "sin revocaciones" abriría la plataforma.
	test("serves the last known value when inner fails", async () => {
		const fake = createFakeInner();
		const { logger, entries } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 5,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		const warm = await cache.get();
		fake.failWith(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
		await sleep(20);
		const stale = await cache.get();

		expect(stale).toBe(warm);
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("error");
		expect(entries[0].data?.message).toBe("connect ECONNREFUSED 10.0.0.5:5432");
	});

	// El otro lado del mismo criterio: arranque en frío con la base caída ⇒ no hay
	// último valor conocido, así que se relanza y el middleware deniega.
	test("rethrows when inner fails cold, with nothing cached", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 10_000,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		fake.failWith(new Error("database is down"));

		await expect(cache.get()).rejects.toThrow("database is down");
	});

	test("a failed read is not cached — the next call retries", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 10_000,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		fake.failWith(new Error("transient"));
		await cache.get().catch(() => null);
		fake.failWith(null);
		const recovered = await cache.get();

		expect(fake.calls.get).toBe(2);
		expect(recovered.tokensValidAfter).toBeDefined();
	});

	test("revokeAllTokens invalidates the cache", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 10_000,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		await cache.get();
		await cache.revokeAllTokens();
		await cache.get();

		// 2 lecturas: la de calentar y la de después del corte. Sin invalidación
		// habría una sola y el proceso que revoca serviría su propio estado viejo.
		expect(fake.calls.get).toBe(2);
		expect(fake.calls.revokeAllTokens).toBe(1);
	});

	test("revokeUserTokens invalidates the cache", async () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 10_000,
			logger,
			bus: createMemoryInvalidationBus(),
		});

		await cache.get();
		await cache.revokeUserTokens(7);
		await cache.get();

		expect(fake.calls.get).toBe(2);
		expect(fake.calls.revokeUserTokens).toBe(1);
	});
});

describe("createCachedSecurityStateRepository — lockdown invalidation", () => {
	const cacheOf = () => {
		const fake = createFakeInner();
		const { logger } = createSpyLogger();
		return {
			fake,
			cache: createCachedSecurityStateRepository({
				inner: fake.inner,
				ttlMs: 10_000,
				logger,
				bus: createMemoryInvalidationBus(),
			}),
		};
	};

	// Sin invalidar, el propio proceso que cierra la plataforma seguiría sirviendo
	// su snapshot viejo hasta que expirara el TTL — y dejando entrar durante ese
	// hueco justo a quien acaba de bloquear.
	test("lockdown invalidates the cache and returns the purge count", async () => {
		const { fake, cache } = cacheOf();

		await cache.get();
		const result = await cache.lockdown({ scope: "all", by: 7 });
		await cache.get();

		expect(result.purgedSessions).toBe(4);
		expect(fake.calls.lockdown).toBe(1);
		expect(fake.calls.get).toBe(2);
	});

	// El mismo criterio al levantarlo: si no se invalidara, la plataforma seguiría
	// cerrada durante todo el TTL después de haberla reabierto.
	test("lift invalidates the cache", async () => {
		const { fake, cache } = cacheOf();

		await cache.get();
		await cache.lift();
		await cache.get();

		expect(fake.calls.lift).toBe(1);
		expect(fake.calls.get).toBe(2);
	});
});

describe("createCachedSecurityStateRepository — aviso entre nodos", () => {
	/** Bus que registra lo publicado y deja disparar el aviso de "otro nodo". */
	const createSpyBus = () => {
		const published: string[] = [];
		const handlers = new Map<string, () => void>();
		const bus: InvalidationBus = {
			async publish(channel) {
				published.push(channel);
			},
			subscribe(channel, onInvalidate) {
				handlers.set(channel, onInvalidate);
			},
		};
		const remoteInvalidation = () =>
			handlers.get(SECURITY_STATE_INVALIDATION_CHANNEL)?.();
		return { bus, published, remoteInvalidation };
	};

	const cacheOf = () => {
		const fake = createFakeInner();
		const spy = createSpyBus();
		const { logger } = createSpyLogger();
		const cache = createCachedSecurityStateRepository({
			inner: fake.inner,
			ttlMs: 60_000,
			logger,
			bus: spy.bus,
		});
		return { fake, cache, ...spy };
	};

	test("tras el aviso de otro nodo relee sin esperar el TTL", async () => {
		const { fake, cache, remoteInvalidation } = cacheOf();
		await cache.get();
		const moved = snapshotOf(new Date("2026-07-30T13:00:00.000Z"));
		fake.setSnapshot(moved);

		remoteInvalidation();
		const after = await cache.get();

		expect(fake.calls.get).toBe(2);
		expect(after.tokensValidAfter).toEqual(moved.tokensValidAfter);
	});

	// El aviso no borra el respaldo: si la base cae justo después, el corte que
	// ya se conocía sigue en pie en vez de denegar a todos.
	test("tras el aviso, con la base caída, sirve el último valor conocido", async () => {
		const { fake, cache, remoteInvalidation } = cacheOf();
		const warm = await cache.get();

		remoteInvalidation();
		fake.failWith(new Error("database is down"));

		expect(await cache.get()).toBe(warm);
	});

	// La escritura propia sí deja la caché en frío: el estado de antes del corte
	// no puede servir de respaldo del estado de después.
	test("tras una escritura propia, con la base caída, deniega", async () => {
		const { fake, cache } = cacheOf();
		await cache.get();

		await cache.revokeAllTokens();
		fake.failWith(new Error("database is down"));

		await expect(cache.get()).rejects.toThrow("database is down");
	});

	test("una lectura en vuelo durante el aviso no deja cacheado el estado viejo", async () => {
		const { fake, cache, remoteInvalidation } = cacheOf();
		let release: (snapshot: SecuritySnapshot) => void = () => {};
		const stale = snapshotOf(new Date("2026-07-30T12:00:00.000Z"));
		const original = fake.inner.get;
		fake.inner.get = () =>
			new Promise<SecuritySnapshot>((resolve) => {
				release = resolve;
			});

		const pending = cache.get();
		remoteInvalidation();
		release(stale);
		await pending;

		fake.inner.get = original;
		const fresh = snapshotOf(new Date("2026-07-30T14:00:00.000Z"));
		fake.setSnapshot(fresh);

		expect((await cache.get()).tokensValidAfter).toEqual(
			fresh.tokensValidAfter,
		);
	});

	test.each([
		[
			"revokeAllTokens",
			(cache: SecurityStateRepository) => cache.revokeAllTokens(),
		],
		[
			"revokeUserTokens",
			(cache: SecurityStateRepository) => cache.revokeUserTokens(7),
		],
		[
			"lockdown",
			(cache: SecurityStateRepository) =>
				cache.lockdown({ scope: "all", by: 7 }),
		],
		["lift", (cache: SecurityStateRepository) => cache.lift()],
	] as const)("%s avisa a los demás nodos", async (_name, write) => {
		const { cache, published } = cacheOf();

		await write(cache);

		expect(published).toEqual([SECURITY_STATE_INVALIDATION_CHANNEL]);
	});
});
