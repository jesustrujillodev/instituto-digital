import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	THEME_ERROR_CODES,
	ThemePreferenceNotSavedError,
} from "../../domain/theme.errors";
import type { ThemeMode } from "../../domain/theme.types";
import { createThemeService } from "../theme.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

interface HarnessOptions {
	storedMode?: ThemeMode | null;
	onRead?: () => never;
	onSave?: () => never;
}

/**
 * El doble incluye SOLO los métodos que el servicio toca. Un doble completo del
 * cradle escondería de qué depende realmente cada caso de uso.
 */
const createHarness = (options: HarnessOptions = {}) => {
	const calls = {
		reads: 0,
		saves: [] as Array<[number, ThemeMode]>,
	};

	const themeRepository = {
		findModeByUserId: async () => {
			calls.reads += 1;
			options.onRead?.();
			return options.storedMode ?? null;
		},
		saveMode: async (userId: number, mode: ThemeMode) => {
			options.onSave?.();
			calls.saves.push([userId, mode]);
		},
	} as unknown as ICradle["themeRepository"];

	return {
		service: createThemeService({ themeRepository, logger: silentLogger }),
		calls,
	};
};

describe("resolveMode", () => {
	test("uses the cookie", async () => {
		const { service } = createHarness();

		const result = await service.resolveMode({
			cookieMode: "dark",
			userId: null,
		});

		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe("dark");
	});

	// El loader raíz corre en TODA petición. Si esto se rompiera, cada carga de
	// cada página pagaría una consulta de más — el fallo sería de rendimiento, no
	// de comportamiento, y no lo notaría nadie hasta producción.
	test("does NOT hit the database when the cookie already decides", async () => {
		const { service, calls } = createHarness({ storedMode: "light" });

		await service.resolveMode({ cookieMode: "dark", userId: 7 });

		expect(calls.reads).toBe(0);
	});

	test("reads the account only when there is a session and no cookie", async () => {
		const { service, calls } = createHarness({ storedMode: "light" });

		const result = await service.resolveMode({ cookieMode: null, userId: 7 });

		expect(calls.reads).toBe(1);
		if (result.success) expect(result.data).toBe("light");
	});

	test("never touches the account for an anonymous visitor", async () => {
		const { service, calls } = createHarness();

		const result = await service.resolveMode({
			cookieMode: null,
			userId: null,
		});

		expect(calls.reads).toBe(0);
		if (result.success) expect(result.data).toBe("system");
	});

	// El modo NO es una decisión de seguridad: con la base caída se sirve el modo
	// por defecto en vez de tumbar todas las páginas de la aplicación.
	test("degrades to system when the preference read fails", async () => {
		const { service } = createHarness({
			onRead: () => {
				throw new Error("connection refused");
			},
		});

		const result = await service.resolveMode({ cookieMode: null, userId: 7 });

		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe("system");
	});

	// Un driver puede lanzar algo que no es un Error. El registro tiene que
	// seguir diciendo qué pasó en vez de "[object Object]".
	test("degrades the same way when what was thrown is not an Error", async () => {
		const { service } = createHarness({
			onRead: () => {
				throw "connection refused" as never;
			},
		});

		const result = await service.resolveMode({ cookieMode: null, userId: 7 });

		expect(result.success).toBe(true);
	});
});

describe("setMode", () => {
	test("persists the preference and returns the ok envelope", async () => {
		const { service, calls } = createHarness();

		const result = await service.setMode({ userId: 7, mode: "dark" });

		expect(result.success).toBe(true);
		expect(calls.saves).toEqual([[7, "dark"]]);
	});

	// Un visitante anónimo eligiendo modo es un caso legítimo, no un error: la
	// cookie que emite el adaptador ya es toda la persistencia que hay.
	test("is a no-op without a session, and still succeeds", async () => {
		const { service, calls } = createHarness();

		const result = await service.setMode({ userId: null, mode: "dark" });

		expect(result.success).toBe(true);
		expect(calls.saves).toEqual([]);
	});

	test("returns the fail envelope with the typed code when saving fails", async () => {
		const { service } = createHarness({
			onSave: () => {
				throw new ThemePreferenceNotSavedError();
			},
		});

		const result = await service.setMode({ userId: 7, mode: "dark" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PREFERENCE_NOT_SAVED);
		}
	});

	// Un error sin tipar no puede filtrar su mensaje (puede traer una consulta
	// SQL o una ruta del sistema de archivos).
	test("normalises an untyped failure to UNEXPECTED_ERROR", async () => {
		const { service } = createHarness({
			onSave: () => {
				throw new Error("connection string: postgres://user:pass@host");
			},
		});

		const result = await service.setMode({ userId: 7, mode: "dark" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("UNEXPECTED_ERROR");
			expect(result.error.message).not.toContain("postgres://");
		}
	});
});
