import { describe, expect, test } from "vitest";
import type { LogData, Logger } from "@/shared/logging/logger";
import { DEFAULT_THEME_TOKENS } from "../../domain/theme.config";
import type {
	IActiveThemeSnapshot,
	IThemeRepository,
} from "../../domain/theme.repository";
import type { ActiveTheme, ThemeTokens } from "../../domain/theme.types";
import { createCachedThemeRepository } from "../theme.cache.server";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const activeTheme = (name: string): ActiveTheme => ({
	documentId: "11111111-1111-4111-8111-111111111111",
	name,
	tokens: DEFAULT_THEME_TOKENS,
});

/** `inner` falso con contador de llamadas y un fallo programable. */
const createFakeInner = () => {
	const calls = {
		findActiveTheme: 0,
		findModeByUserId: 0,
		saveMode: 0,
		listThemes: 0,
		findTheme: 0,
		createTheme: 0,
		renameTheme: 0,
		saveDraft: 0,
		publishTheme: 0,
		activateTheme: 0,
		deleteTheme: 0,
	};
	let current: ActiveTheme | null = activeTheme("Original");
	let failure: Error | null = null;

	const inner: IThemeRepository = {
		async findModeByUserId() {
			calls.findModeByUserId += 1;
			return null;
		},
		async saveMode() {
			calls.saveMode += 1;
		},
		async findActiveTheme() {
			calls.findActiveTheme += 1;
			if (failure) throw failure;
			return current;
		},
		async listThemes() {
			calls.listThemes += 1;
			return [];
		},
		async findTheme() {
			calls.findTheme += 1;
			return null;
		},
		async createTheme({ name, tokens }) {
			calls.createTheme += 1;
			return {
				documentId: "nuevo",
				name,
				isPreset: false,
				draftTokens: tokens,
				publishedTokens: null,
				publishedAt: null,
			};
		},
		async renameTheme() {
			calls.renameTheme += 1;
		},
		async saveDraft() {
			calls.saveDraft += 1;
		},
		async publishTheme(_documentId: string, tokens: ThemeTokens) {
			calls.publishTheme += 1;
			current = { ...activeTheme("Publicado"), tokens };
		},
		async activateTheme() {
			calls.activateTheme += 1;
		},
		async deleteTheme() {
			calls.deleteTheme += 1;
		},
	};

	return {
		inner,
		calls,
		setActive: (value: ActiveTheme | null) => {
			current = value;
		},
		fail: (error: Error | null) => {
			failure = error;
		},
	};
};

/** Snapshot en memoria con lo escrito a la vista y un fallo de escritura programable. */
const createFakeSnapshot = () => {
	let stored: ActiveTheme | null | undefined;
	let writeFailure: Error | null = null;
	const writes: Array<ActiveTheme | null> = [];

	const snapshot: IActiveThemeSnapshot = {
		async read() {
			return stored;
		},
		async write(theme) {
			if (writeFailure) throw writeFailure;
			writes.push(theme);
			stored = theme;
		},
	};

	return {
		snapshot,
		writes,
		seed: (value: ActiveTheme | null | undefined) => {
			stored = value;
		},
		failWrites: (error: Error | null) => {
			writeFailure = error;
		},
	};
};

const build = (ttlMs = 50, retryMs = 10) => {
	const fake = createFakeInner();
	const fakeSnapshot = createFakeSnapshot();
	const { logger, entries } = createSpyLogger();

	return {
		...fake,
		...fakeSnapshot,
		entries,
		repository: createCachedThemeRepository({
			inner: fake.inner,
			ttlMs,
			retryMs,
			snapshot: fakeSnapshot.snapshot,
			logger,
		}),
	};
};

/** Deja correr las escrituras del snapshot, que no se esperan. */
const flush = () => sleep(0);

describe("findActiveTheme", () => {
	// La razón de existir de la caché: el loader raíz lo lee en TODA petición,
	// incluidas la landing y el login.
	test("serves from memory within the TTL", async () => {
		const { repository, calls } = build();

		await repository.findActiveTheme();
		await repository.findActiveTheme();
		await repository.findActiveTheme();

		expect(calls.findActiveTheme).toBe(1);
	});

	test("re-reads once the TTL has passed", async () => {
		const { repository, calls } = build(10);

		await repository.findActiveTheme();
		await sleep(20);
		await repository.findActiveTheme();

		expect(calls.findActiveTheme).toBe(2);
	});

	// "No hay tema activo" es una respuesta legítima y hay que cachearla igual:
	// si `null` se tratara como "no cargado", la plataforma sin tema activo
	// pagaría una consulta por petición para siempre.
	test("caches the absence of an active theme too", async () => {
		const { repository, calls, setActive } = build();
		setActive(null);

		expect(await repository.findActiveTheme()).toBeNull();
		expect(await repository.findActiveTheme()).toBeNull();
		expect(calls.findActiveTheme).toBe(1);
	});

	// Al expirar el TTL bajo carga, mil peticiones simultáneas deben producir UNA
	// consulta, no mil.
	test("collapses concurrent reads into a single query", async () => {
		const { repository, calls } = build();

		await Promise.all([
			repository.findActiveTheme(),
			repository.findActiveTheme(),
			repository.findActiveTheme(),
		]);

		expect(calls.findActiveTheme).toBe(1);
	});

	test("serves the last known value when a refresh fails, and logs it", async () => {
		const { repository, entries, fail } = build(10);

		expect((await repository.findActiveTheme())?.name).toBe("Original");

		await sleep(20);
		fail(new Error("connection refused"));

		expect((await repository.findActiveTheme())?.name).toBe("Original");
		expect(entries.some((entry) => entry.level === "error")).toBe(true);
	});

	// Sin memoria ni snapshot, el fallo en frío se PROPAGA: quien decide es el
	// servicio (tema base marcado `fallback`). Devolver `null` aquí se confundiría
	// con "no hay tema activo", que es un dato y el navegador lo guardaría.
	test("propagates a cold failure when there is no snapshot either", async () => {
		const { repository, fail } = build();
		fail(new Error("connection refused"));

		await expect(repository.findActiveTheme()).rejects.toThrow(
			"connection refused",
		);
	});

	// La razón del snapshot: un proceso que arranca con la base caída —reinicio,
	// deploy, recarga del dev server— sigue sirviendo la marca.
	test("serves the snapshot on a cold failure, and logs it", async () => {
		const { repository, entries, fail, seed } = build();
		seed(activeTheme("Del disco"));
		fail(new Error("connection refused"));

		expect((await repository.findActiveTheme())?.name).toBe("Del disco");
		expect(entries.find((entry) => entry.level === "error")?.data?.source).toBe(
			"snapshot",
		);
	});

	test("a snapshot that says 'no active theme' is served as such", async () => {
		const { repository, fail, seed } = build();
		seed(null);
		fail(new Error("connection refused"));

		expect(await repository.findActiveTheme()).toBeNull();
	});

	// Mientras la base no responde, cada petición esperaría el timeout de conexión
	// para acabar sirviendo lo mismo.
	test("waits the retry window before trying the database again", async () => {
		const { repository, calls, fail, seed } = build(60_000, 20);
		seed(activeTheme("Del disco"));
		fail(new Error("connection refused"));

		await repository.findActiveTheme();
		await repository.findActiveTheme();
		expect(calls.findActiveTheme).toBe(1);

		await sleep(30);
		fail(null);
		expect((await repository.findActiveTheme())?.name).toBe("Original");
		expect(calls.findActiveTheme).toBe(2);
	});

	// Una escritura solo EXPIRA la caché: si la relectura coincide con una caída,
	// se sigue sirviendo lo de memoria en vez de bajar al disco o al tema base.
	test("a write keeps the memory copy as the fallback", async () => {
		const { repository, fail } = build(60_000);

		await repository.findActiveTheme();
		await repository.activateTheme("x");
		fail(new Error("connection refused"));

		expect((await repository.findActiveTheme())?.name).toBe("Original");
	});

	// Un driver puede lanzar algo que no es un Error; el registro tiene que
	// seguir diciendo qué pasó en vez de "[object Object]".
	test("logs a non-Error failure without losing what it was", async () => {
		const { repository, entries, fail } = build(10);

		await repository.findActiveTheme();
		await sleep(20);
		fail("connection refused" as unknown as Error);

		await repository.findActiveTheme();

		expect(
			entries.find((entry) => entry.level === "error")?.data?.message,
		).toBe("connection refused");
	});

	test("recovers after a cold failure", async () => {
		const { repository, fail } = build();
		fail(new Error("boom"));
		await expect(repository.findActiveTheme()).rejects.toThrow();

		fail(null);
		expect((await repository.findActiveTheme())?.name).toBe("Original");
	});
});

describe("snapshot", () => {
	test("writes the first successful read of the process", async () => {
		const { repository, writes } = build();

		await repository.findActiveTheme();
		await flush();

		expect(writes.map((theme) => theme?.name)).toEqual(["Original"]);
	});

	// El caso normal es una relectura por TTL que devuelve lo mismo: no debe tocar
	// el disco cada minuto.
	test("does not rewrite it while the active theme is unchanged", async () => {
		const { repository, writes } = build(5);

		await repository.findActiveTheme();
		await sleep(10);
		await repository.findActiveTheme();
		await flush();

		expect(writes).toHaveLength(1);
	});

	test.each([
		["another theme", activeTheme("Otro")],
		[
			"the same theme with new tokens",
			{
				...activeTheme("Original"),
				tokens: {
					...DEFAULT_THEME_TOKENS,
					shared: { ...DEFAULT_THEME_TOKENS.shared, radius: "1.5rem" },
				},
			},
		],
		["no active theme", null],
	])("rewrites it when the active theme becomes %s", async (_name, next) => {
		const { repository, writes, setActive } = build(5);

		await repository.findActiveTheme();
		await sleep(10);
		setActive(next);
		await repository.findActiveTheme();
		await flush();

		expect(writes).toHaveLength(2);
		expect(writes[1]).toEqual(next);
	});

	// El disco es la red, no la lectura: un fallo al escribir se registra, no
	// tumba la respuesta, y se reintenta en la próxima lectura con éxito.
	test("a failed write does not break the read, and is retried", async () => {
		const { repository, writes, entries, failWrites } = build(5);
		failWrites(new Error("EACCES"));

		expect((await repository.findActiveTheme())?.name).toBe("Original");
		await flush();
		expect(entries.some((entry) => entry.level === "warn")).toBe(true);

		failWrites(null);
		await sleep(10);
		await repository.findActiveTheme();
		await flush();

		expect(writes).toHaveLength(1);
	});

	test("logs a non-Error write failure without losing what it was", async () => {
		const { repository, entries, failWrites } = build();
		failWrites("disk full" as unknown as Error);

		await repository.findActiveTheme();
		await flush();

		expect(entries.find((entry) => entry.level === "warn")?.data?.message).toBe(
			"disk full",
		);
	});

	test("never serves the snapshot while the database answers", async () => {
		const { repository, seed } = build();
		seed(activeTheme("Del disco"));

		expect((await repository.findActiveTheme())?.name).toBe("Original");
	});
});

describe("invalidación", () => {
	// Toda escritura invalida la copia LOCAL para que el proceso que publica
	// responda ya con el tema nuevo, aunque los demás nodos tarden el TTL.
	test("publishing makes the very next read see the new theme", async () => {
		const { repository, calls } = build(60_000);

		expect((await repository.findActiveTheme())?.name).toBe("Original");

		await repository.publishTheme("x", DEFAULT_THEME_TOKENS);

		expect((await repository.findActiveTheme())?.name).toBe("Publicado");
		expect(calls.findActiveTheme).toBe(2);
	});

	test.each([
		[
			"createTheme",
			(r: IThemeRepository) =>
				r.createTheme({ name: "x", tokens: DEFAULT_THEME_TOKENS }),
		],
		["renameTheme", (r: IThemeRepository) => r.renameTheme("x", "y")],
		[
			"saveDraft",
			(r: IThemeRepository) => r.saveDraft("x", DEFAULT_THEME_TOKENS),
		],
		["activateTheme", (r: IThemeRepository) => r.activateTheme("x")],
		["deleteTheme", (r: IThemeRepository) => r.deleteTheme("x")],
	])("%s invalidates the cache", async (_name, mutate) => {
		const { repository, calls } = build(60_000);

		await repository.findActiveTheme();
		await mutate(repository);
		await repository.findActiveTheme();

		expect(calls.findActiveTheme).toBe(2);
	});
});

describe("paso de largo", () => {
	// La preferencia de modo es POR CUENTA: cachearla en un singleton de proceso
	// serviría el modo de un usuario a otro.
	test("the per-user mode is never cached", async () => {
		const { repository, calls } = build();

		await repository.findModeByUserId(1);
		await repository.findModeByUserId(1);
		await repository.saveMode(1, "dark");

		expect(calls.findModeByUserId).toBe(2);
		expect(calls.saveMode).toBe(1);
	});

	test("the library reads go straight through", async () => {
		const { repository, calls } = build();

		await repository.listThemes();
		await repository.listThemes();
		await repository.findTheme("x");

		expect(calls.listThemes).toBe(2);
		expect(calls.findTheme).toBe(1);
	});
});
