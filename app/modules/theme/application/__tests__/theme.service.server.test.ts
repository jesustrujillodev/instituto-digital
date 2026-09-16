import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { DEFAULT_THEME_TOKENS } from "../../domain/theme.config";
import {
	THEME_ERROR_CODES,
	ThemePreferenceNotSavedError,
} from "../../domain/theme.errors";
import { exportThemeCss, themeFingerprint } from "../../domain/theme.mapper";
import type {
	ActiveTheme,
	Theme,
	ThemeMode,
	ThemeSummary,
	ThemeTokens,
} from "../../domain/theme.types";
import { createThemeService } from "../theme.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const OWN_ID = "11111111-1111-4111-8111-111111111111";
const PRESET_ID = "22222222-2222-4222-8222-222222222222";

const tokensWith = (radius: string): ThemeTokens => ({
	...DEFAULT_THEME_TOKENS,
	shared: { ...DEFAULT_THEME_TOKENS.shared, radius },
});

const theme = (overrides: Partial<Theme> = {}): Theme => ({
	documentId: OWN_ID,
	name: "Mi tema",
	isPreset: false,
	draftTokens: tokensWith("1rem"),
	publishedTokens: DEFAULT_THEME_TOKENS,
	publishedAt: new Date("2026-08-01T00:00:00.000Z"),
	...overrides,
});

interface HarnessOptions {
	storedMode?: ThemeMode | null;
	onRead?: () => never;
	onSave?: () => never;
	themes?: Theme[];
	summaries?: ThemeSummary[];
	active?: ActiveTheme | null;
	onFindTheme?: () => never;
	onFindActive?: () => never;
	onWrite?: () => never;
}

/**
 * El doble incluye SOLO los métodos que el servicio toca. Un doble completo del
 * cradle escondería de qué depende realmente cada caso de uso.
 */
const createHarness = (options: HarnessOptions = {}) => {
	const calls = {
		reads: 0,
		saves: [] as Array<[number, ThemeMode]>,
		drafts: [] as Array<[string, ThemeTokens]>,
		published: [] as Array<[string, ThemeTokens]>,
		activated: [] as string[],
		deleted: [] as string[],
		renamed: [] as Array<[string, string]>,
		created: [] as Array<{ name: string; tokens: ThemeTokens }>,
		findTheme: [] as string[],
		findActive: 0,
	};

	const themes = options.themes ?? [
		theme(),
		theme({
			documentId: PRESET_ID,
			name: "Neutro",
			isPreset: true,
			draftTokens: DEFAULT_THEME_TOKENS,
		}),
	];

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
		findActiveTheme: async () => {
			calls.findActive += 1;
			options.onFindActive?.();
			return options.active ?? null;
		},
		listThemes: async () => options.summaries ?? [],
		findTheme: async (documentId: string) => {
			calls.findTheme.push(documentId);
			options.onFindTheme?.();
			return themes.find((item) => item.documentId === documentId) ?? null;
		},
		createTheme: async (input: { name: string; tokens: ThemeTokens }) => {
			options.onWrite?.();
			calls.created.push(input);
			return theme({
				documentId: "nuevo",
				name: input.name,
				draftTokens: input.tokens,
				publishedTokens: null,
				publishedAt: null,
			});
		},
		renameTheme: async (documentId: string, name: string) => {
			options.onWrite?.();
			calls.renamed.push([documentId, name]);
		},
		saveDraft: async (documentId: string, tokens: ThemeTokens) => {
			options.onWrite?.();
			calls.drafts.push([documentId, tokens]);
		},
		publishTheme: async (documentId: string, tokens: ThemeTokens) => {
			options.onWrite?.();
			calls.published.push([documentId, tokens]);
		},
		activateTheme: async (documentId: string) => {
			options.onWrite?.();
			calls.activated.push(documentId);
		},
		deleteTheme: async (documentId: string) => {
			options.onWrite?.();
			calls.deleted.push(documentId);
		},
	} as unknown as ICradle["themeRepository"];

	return {
		service: createThemeService({ themeRepository, logger: silentLogger }),
		calls,
	};
};

/** Entrada de `resolve` con los valores que no se están ejercitando en su sitio. */
const resolveInput = (overrides: {
	cookieMode?: unknown;
	userId?: number | null;
	previewDocumentId?: unknown;
	canPreview?: boolean;
}) => ({
	cookieMode: null,
	userId: null,
	previewDocumentId: null,
	canPreview: false,
	...overrides,
});

// ===============================================================
// Fase A — modo
// ===============================================================

describe("resolve", () => {
	test("uses the cookie and returns the CSS for that mode", async () => {
		const { service } = createHarness();

		const result = await service.resolve(resolveInput({ cookieMode: "dark" }));

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.mode).toBe("dark");
			expect(result.data.css).toContain("color-scheme:dark");
		}
	});

	// El loader raíz corre en TODA petición. Si esto se rompiera, cada carga de
	// cada página pagaría una consulta de más — el fallo sería de rendimiento, no
	// de comportamiento, y no lo notaría nadie hasta producción.
	test("does NOT hit the database when the cookie already decides", async () => {
		const { service, calls } = createHarness({ storedMode: "light" });

		await service.resolve(resolveInput({ cookieMode: "dark", userId: 7 }));

		expect(calls.reads).toBe(0);
	});

	test("reads the account only when there is a session and no cookie", async () => {
		const { service, calls } = createHarness({ storedMode: "light" });

		const result = await service.resolve(resolveInput({ userId: 7 }));

		expect(calls.reads).toBe(1);
		if (result.success) expect(result.data.mode).toBe("light");
	});

	test("never touches the account for an anonymous visitor", async () => {
		const { service, calls } = createHarness();

		const result = await service.resolve(resolveInput({}));

		expect(calls.reads).toBe(0);
		if (result.success) expect(result.data.mode).toBe("system");
	});

	// El tema NO es una decisión de seguridad: con la base caída se sirve el tema
	// por defecto en vez de tumbar todas las páginas de la aplicación.
	test("degrades to the default theme when the preference read fails", async () => {
		const { service } = createHarness({
			onRead: () => {
				throw new Error("connection refused");
			},
		});

		const result = await service.resolve(resolveInput({ userId: 7 }));

		expect(result.success).toBe(true);
		if (result.success) expect(result.data.mode).toBe("system");
	});

	// Un driver puede lanzar algo que no es un Error. El registro tiene que
	// seguir diciendo qué pasó en vez de "[object Object]".
	test("degrades the same way when what was thrown is not an Error", async () => {
		const { service } = createHarness({
			onRead: () => {
				throw "connection refused" as never;
			},
		});

		const result = await service.resolve(resolveInput({ userId: 7 }));

		expect(result.success).toBe(true);
	});
});

// ===============================================================
// Fase B — tema activo y preview
// ===============================================================

describe("resolve · tema activo", () => {
	test("serves the published tokens of the active theme", async () => {
		const { service } = createHarness({
			active: {
				documentId: OWN_ID,
				name: "Corporativo",
				tokens: tokensWith("1.5rem"),
			},
		});

		const result = await service.resolve(resolveInput({ cookieMode: "light" }));

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.css).toContain("--radius:1.5rem");
			expect(result.data.preview).toBeNull();
			expect(result.data.origin).toBe("active");
			expect(result.data.fingerprint).toBe(
				themeFingerprint(tokensWith("1.5rem")),
			);
		}
	});

	// "No hay tema activo" es un dato que el servidor SÍ conoce: `active`, no
	// `fallback`. El navegador no debe pintar encima un tema que ya se desactivó.
	test("serves the base theme as 'active' when nothing is active", async () => {
		const { service } = createHarness({ active: null });

		const result = await service.resolve(resolveInput({ cookieMode: "light" }));

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.css).toContain(
				`--radius:${DEFAULT_THEME_TOKENS.shared.radius}`,
			);
			expect(result.data.origin).toBe("active");
		}
	});

	// La caché ya agotó memoria y snapshot antes de lanzar: el servidor no sabe
	// cuál es el tema activo. Se sirve el base marcado `fallback` para que el
	// navegador pinte encima el último que conoció. Degradar es correcto; denegar
	// no.
	test("serves the base theme as 'fallback' when the active theme is unknown", async () => {
		const { service } = createHarness({
			onFindActive: () => {
				throw new Error("connection refused");
			},
		});

		const result = await service.resolve(resolveInput({ cookieMode: "light" }));

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.css).toContain("--radius:");
			expect(result.data.origin).toBe("fallback");
		}
	});

	test("is also 'fallback' when the previewed theme cannot be read", async () => {
		const { service } = createHarness({
			onFindTheme: () => {
				throw new Error("connection refused");
			},
		});

		const result = await service.resolve(
			resolveInput({ previewDocumentId: OWN_ID, canPreview: true }),
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.origin).toBe("fallback");
			expect(result.data.preview).toBeNull();
		}
	});

	test("degrades the same way when what was thrown is not an Error", async () => {
		const { service } = createHarness({
			onFindActive: () => {
				throw "connection refused" as never;
			},
		});

		const result = await service.resolve(resolveInput({ cookieMode: "light" }));

		expect(result.success).toBe(true);
	});

	// 🔒 El punto de seguridad de "probar en toda la app": la cookie dice QUÉ
	// tema, el rol verificado en servidor dice SI se atiende. Si esto se
	// invirtiera, cualquiera podría fabricar la cookie y ver borradores ajenos.
	test("ignores the preview cookie when the requester is not an admin", async () => {
		const { service, calls } = createHarness();

		const result = await service.resolve(
			resolveInput({
				cookieMode: "light",
				previewDocumentId: OWN_ID,
				canPreview: false,
			}),
		);

		expect(calls.findTheme).toEqual([]);
		if (result.success) expect(result.data.preview).toBeNull();
	});

	test("serves the DRAFT tokens to an admin who is previewing", async () => {
		const { service } = createHarness();

		const result = await service.resolve(
			resolveInput({
				cookieMode: "light",
				previewDocumentId: OWN_ID,
				canPreview: true,
			}),
		);

		if (result.success) {
			// El borrador del doble tiene radius 1rem; lo publicado, el del base.
			expect(result.data.css).toContain("--radius:1rem");
			expect(result.data.preview).toEqual({
				documentId: OWN_ID,
				name: "Mi tema",
			});
			// Un borrador nunca se guarda como "último tema activo".
			expect(result.data.origin).toBe("preview");
		}
	});

	test("falls back to the active theme when the previewed one is gone", async () => {
		const { service } = createHarness({
			active: { documentId: "x", name: "Activo", tokens: tokensWith("2rem") },
		});

		const result = await service.resolve(
			resolveInput({
				cookieMode: "light",
				previewDocumentId: "33333333-3333-4333-8333-333333333333",
				canPreview: true,
			}),
		);

		if (result.success) {
			expect(result.data.preview).toBeNull();
			expect(result.data.css).toContain("--radius:2rem");
		}
	});

	test("ignores a preview cookie that is not even a string", async () => {
		const { service, calls } = createHarness();

		await service.resolve(
			resolveInput({ previewDocumentId: { id: 1 }, canPreview: true }),
		);

		expect(calls.findTheme).toEqual([]);
	});
});

describe("setMode", () => {
	test("persists the preference and returns the ok envelope", async () => {
		const { service, calls } = createHarness();

		const result = await service.setMode({ userId: 7, mode: "dark" });

		expect(result.success).toBe(true);
		expect(calls.saves).toEqual([[7, "dark"]]);
	});

	// Un visitante anónimo eligiendo tema es un caso legítimo, no un error: la
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

// ===============================================================
// Fase B — biblioteca
// ===============================================================

describe("listThemes", () => {
	test("returns the summaries inside the ok envelope", async () => {
		const summaries: ThemeSummary[] = [
			{
				documentId: OWN_ID,
				name: "Mi tema",
				isPreset: false,
				isActive: true,
				isPublished: true,
				hasUnpublishedChanges: true,
			},
		];
		const { service } = createHarness({ summaries });

		const result = await service.listThemes();

		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toEqual(summaries);
	});
});

describe("getTheme", () => {
	test("returns the theme with both token sets", async () => {
		const { service } = createHarness();

		const result = await service.getTheme({ documentId: OWN_ID });

		expect(result.success).toBe(true);
		if (result.success) expect(result.data.name).toBe("Mi tema");
	});

	test("fails with NOT_FOUND for a theme that does not exist", async () => {
		const { service } = createHarness();

		const result = await service.getTheme({ documentId: "no-existe" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.NOT_FOUND);
		}
	});
});

describe("createTheme", () => {
	test("starts from the base theme when there is no origin", async () => {
		const { service, calls } = createHarness();

		const result = await service.createTheme({ name: "Nuevo" });

		expect(result.success).toBe(true);
		expect(calls.created[0]?.tokens).toEqual(DEFAULT_THEME_TOKENS);
	});

	// Se copia el BORRADOR y no lo publicado: es lo que el admin estaba viendo al
	// pulsar, no una versión anterior.
	test("copies the DRAFT of the origin theme", async () => {
		const { service, calls } = createHarness();

		await service.createTheme({ name: "Copia", fromDocumentId: OWN_ID });

		expect(calls.created[0]?.tokens).toEqual(tokensWith("1rem"));
	});

	test("fails with NOT_FOUND when the origin does not exist", async () => {
		const { service } = createHarness();

		const result = await service.createTheme({
			name: "Copia",
			fromDocumentId: "no-existe",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.NOT_FOUND);
		}
	});
});

describe("cloneTheme", () => {
	// Es la ÚNICA vía para partir de un preset, así que tiene que funcionar
	// justamente sobre lo que el resto de operaciones rechaza.
	test("clones a factory preset, which is the only way to start from one", async () => {
		const { service, calls } = createHarness();

		const result = await service.cloneTheme({
			documentId: PRESET_ID,
			name: "Neutro (copia)",
		});

		expect(result.success).toBe(true);
		expect(calls.created[0]).toEqual({
			name: "Neutro (copia)",
			tokens: DEFAULT_THEME_TOKENS,
		});
	});

	test("fails with NOT_FOUND for a source that does not exist", async () => {
		const { service } = createHarness();

		const result = await service.cloneTheme({
			documentId: "no-existe",
			name: "x",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.NOT_FOUND);
		}
	});
});

describe("renameTheme", () => {
	test("renames a theme of your own", async () => {
		const { service, calls } = createHarness();

		const result = await service.renameTheme({
			documentId: OWN_ID,
			name: "Otro nombre",
		});

		expect(result.success).toBe(true);
		expect(calls.renamed).toEqual([[OWN_ID, "Otro nombre"]]);
	});

	test("refuses a factory preset with its typed code, and writes nothing", async () => {
		const { service, calls } = createHarness();

		const result = await service.renameTheme({
			documentId: PRESET_ID,
			name: "x",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PRESET_IMMUTABLE);
		}
		expect(calls.renamed).toEqual([]);
	});
});

describe("saveDraft", () => {
	test("persists the tokens and returns the ok envelope", async () => {
		const { service, calls } = createHarness();
		const tokens = tokensWith("0.2rem");

		const result = await service.saveDraft({ documentId: OWN_ID, tokens });

		expect(result.success).toBe(true);
		expect(calls.drafts).toEqual([[OWN_ID, tokens]]);
	});

	test("refuses a factory preset, and writes nothing", async () => {
		const { service, calls } = createHarness();

		const result = await service.saveDraft({
			documentId: PRESET_ID,
			tokens: DEFAULT_THEME_TOKENS,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PRESET_IMMUTABLE);
		}
		expect(calls.drafts).toEqual([]);
	});

	test("returns the fail envelope when the write itself fails", async () => {
		const { service } = createHarness({
			onWrite: () => {
				throw new Error("deadlock detected");
			},
		});

		const result = await service.saveDraft({
			documentId: OWN_ID,
			tokens: DEFAULT_THEME_TOKENS,
		});

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("UNEXPECTED_ERROR");
	});
});

describe("importThemeCss", () => {
	test("replaces the draft with the pasted theme", async () => {
		const { service, calls } = createHarness();

		const result = await service.importThemeCss({
			documentId: OWN_ID,
			css: exportThemeCss(tokensWith("0.75rem")),
		});

		expect(result.success).toBe(true);
		expect(calls.drafts[0]?.[1].shared.radius).toBe("0.75rem");
	});

	// El tema actual es la BASE del pegado: lo que el bloque no declara se queda
	// como estaba en vez de saltar al tema por defecto.
	test("uses the current draft as the base for what the paste omits", async () => {
		const { service, calls } = createHarness();

		await service.importThemeCss({
			documentId: OWN_ID,
			css: ":root { --background: #fff; --foreground: #000; --primary: #333; }",
		});

		expect(calls.drafts[0]?.[1].shared.radius).toBe("1rem");
	});

	test("fails with its typed code when the CSS is not a theme", async () => {
		const { service, calls } = createHarness();

		const result = await service.importThemeCss({
			documentId: OWN_ID,
			css: "body { color: red }",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.CSS_NOT_PARSEABLE);
		}
		expect(calls.drafts).toEqual([]);
	});

	test("refuses a factory preset", async () => {
		const { service } = createHarness();

		const result = await service.importThemeCss({
			documentId: PRESET_ID,
			css: exportThemeCss(DEFAULT_THEME_TOKENS),
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PRESET_IMMUTABLE);
		}
	});

	// El parser es tolerante, pero lo que sale de él vuelve a pasar por el mismo
	// esquema: nada llega a la base de datos por la puerta de atrás.
	test("rejects a paste whose result would not validate", async () => {
		const { service } = createHarness();

		const result = await service.importThemeCss({
			documentId: OWN_ID,
			css: ":root { --background: #fff; --foreground: #000; --primary: #333; --secondary: muy-azul; }",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.CSS_NOT_PARSEABLE);
		}
	});

	// Una medida fuera de rango se RECORTA, no tumba la importación: el resto del
	// tema pegado es bueno, y rechazarlo entero por un `--radius` exagerado dejaba
	// al admin sin ninguna pista de cuál de los quince valores era el culpable.
	test("clamps an out-of-range measure instead of refusing the paste", async () => {
		const { service, calls } = createHarness();

		const result = await service.importThemeCss({
			documentId: OWN_ID,
			css: ":root { --background: #fff; --foreground: #000; --primary: #333; --radius: 9rem; }",
		});

		expect(result.success).toBe(true);
		expect(calls.drafts[0]?.[1].shared.radius).toBe("2rem");
	});
});

describe("publishTheme", () => {
	test("copies the draft into the published tokens", async () => {
		const { service, calls } = createHarness();

		const result = await service.publishTheme({ documentId: OWN_ID });

		expect(result.success).toBe(true);
		expect(calls.published).toEqual([[OWN_ID, tokensWith("1rem")]]);
	});

	test("refuses a factory preset", async () => {
		const { service, calls } = createHarness();

		const result = await service.publishTheme({ documentId: PRESET_ID });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PRESET_IMMUTABLE);
		}
		expect(calls.published).toEqual([]);
	});
});

describe("activateTheme", () => {
	// Un preset SÍ se puede activar: es inmutable, no inservible.
	test("activates a published theme, preset included", async () => {
		const { service, calls } = createHarness();

		expect((await service.activateTheme({ documentId: OWN_ID })).success).toBe(
			true,
		);
		expect(
			(await service.activateTheme({ documentId: PRESET_ID })).success,
		).toBe(true);
		expect(calls.activated).toEqual([OWN_ID, PRESET_ID]);
	});

	// Activar uno sin publicar dejaría a la app sirviendo tokens en edición.
	test("refuses a theme that was never published, and activates nothing", async () => {
		const { service, calls } = createHarness({
			themes: [theme({ publishedTokens: null, publishedAt: null })],
		});

		const result = await service.activateTheme({ documentId: OWN_ID });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.NEVER_PUBLISHED);
		}
		expect(calls.activated).toEqual([]);
	});
});

describe("discardDraft", () => {
	test("restores the draft from the published tokens", async () => {
		const { service, calls } = createHarness();

		const result = await service.discardDraft({ documentId: OWN_ID });

		expect(result.success).toBe(true);
		expect(calls.drafts).toEqual([[OWN_ID, DEFAULT_THEME_TOKENS]]);
	});

	// Sin publicado no hay a dónde volver.
	test("refuses when the theme was never published", async () => {
		const { service, calls } = createHarness({
			themes: [theme({ publishedTokens: null, publishedAt: null })],
		});

		const result = await service.discardDraft({ documentId: OWN_ID });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.NEVER_PUBLISHED);
		}
		expect(calls.drafts).toEqual([]);
	});

	test("refuses a factory preset", async () => {
		const { service } = createHarness();

		const result = await service.discardDraft({ documentId: PRESET_ID });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PRESET_IMMUTABLE);
		}
	});
});

describe("deleteTheme", () => {
	test("deletes an inactive theme of your own", async () => {
		const { service, calls } = createHarness({ active: null });

		const result = await service.deleteTheme({ documentId: OWN_ID });

		expect(result.success).toBe(true);
		expect(calls.deleted).toEqual([OWN_ID]);
	});

	// La FK es `onDelete: SetNull`, así que la base aguantaría — pero dejaría la
	// plataforma sin tema activo por un clic. La regla vive en el dominio.
	test("refuses to delete the theme the platform is serving", async () => {
		const { service, calls } = createHarness({
			active: {
				documentId: OWN_ID,
				name: "Mi tema",
				tokens: DEFAULT_THEME_TOKENS,
			},
		});

		const result = await service.deleteTheme({ documentId: OWN_ID });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(
				THEME_ERROR_CODES.ACTIVE_CANNOT_BE_DELETED,
			);
		}
		expect(calls.deleted).toEqual([]);
	});

	test("refuses a factory preset", async () => {
		const { service, calls } = createHarness({ active: null });

		const result = await service.deleteTheme({ documentId: PRESET_ID });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.PRESET_IMMUTABLE);
		}
		expect(calls.deleted).toEqual([]);
	});

	test("fails with NOT_FOUND for a theme that does not exist", async () => {
		const { service } = createHarness();

		const result = await service.deleteTheme({ documentId: "no-existe" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(THEME_ERROR_CODES.NOT_FOUND);
		}
	});
});
