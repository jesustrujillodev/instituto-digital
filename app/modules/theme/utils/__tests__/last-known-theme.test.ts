import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_THEME_TOKENS } from "../../domain/theme.config";
import { themeCss, themeFingerprint } from "../../domain/theme.mapper";
import type { ResolvedTheme, ThemeTokens } from "../../domain/theme.types";
import {
	applyLastKnownThemeFor,
	clearLastKnownTheme,
	LAST_KNOWN_THEME_STORAGE_KEY,
	LAST_KNOWN_THEME_STYLE_ID,
	lastKnownThemeScript,
	rememberActiveTheme,
	THEME_STYLE_ID,
} from "../last-known-theme";

// El entorno de vitest es `node` (sin jsdom): se dobla SOLO lo que el módulo toca
// de `localStorage` y del DOM.

const createStorage = (initial: Record<string, string> = {}) => {
	const data = new Map(Object.entries(initial));
	let failWrites = false;
	const storage = {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			if (failWrites) throw new Error("QuotaExceededError");
			data.set(key, value);
		},
		removeItem: (key: string) => data.delete(key),
		clear: () => data.clear(),
		key: () => null,
		length: 0,
	} as Storage;

	return {
		storage,
		data,
		stored: () => JSON.parse(data.get(LAST_KNOWN_THEME_STORAGE_KEY) ?? "null"),
		failWrites: () => {
			failWrites = true;
		},
	};
};

type FakeElement = {
	id: string;
	textContent: string;
	after: (element: FakeElement) => void;
	remove: () => void;
};

/** `document` mínimo: nodos del `<head>` en orden, para comprobar la posición. */
const createDocument = ({ withBaseStyle = true } = {}) => {
	const head: FakeElement[] = [];

	const element = (id = ""): FakeElement => {
		const node: FakeElement = {
			id,
			textContent: "",
			after: (next) => head.splice(head.indexOf(node) + 1, 0, next),
			remove: () => {
				const index = head.indexOf(node);
				if (index >= 0) head.splice(index, 1);
			},
		};
		return node;
	};

	if (withBaseStyle) head.push(element(THEME_STYLE_ID), element("links"));

	const document = {
		head: { appendChild: (node: FakeElement) => head.push(node) },
		getElementById: (id: string) => head.find((node) => node.id === id) ?? null,
		createElement: () => element(),
	};

	return { document, head };
};

const install = (storage: Storage, options?: { withBaseStyle?: boolean }) => {
	const fake = createDocument(options);
	vi.stubGlobal("window", { localStorage: storage });
	vi.stubGlobal("document", fake.document);
	return fake;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

const tokensWith = (radius: string): ThemeTokens => ({
	...DEFAULT_THEME_TOKENS,
	shared: { ...DEFAULT_THEME_TOKENS.shared, radius },
});

const resolved = (
	overrides: Partial<ResolvedTheme> & { tokens?: ThemeTokens } = {},
): ResolvedTheme => {
	const { tokens = tokensWith("1.25rem"), ...rest } = overrides;
	const mode = rest.mode ?? "light";
	return {
		mode,
		css: themeCss(tokens, mode),
		preview: null,
		origin: "active",
		fingerprint: themeFingerprint(tokens),
		...rest,
	};
};

describe("rememberActiveTheme", () => {
	test("stores the CSS of the active theme under its mode", () => {
		const { storage, stored } = createStorage();
		const theme = resolved();

		rememberActiveTheme(storage, theme);

		expect(stored()).toEqual({
			v: 1,
			fingerprint: theme.fingerprint,
			css: { light: theme.css },
		});
	});

	// Un borrador en preview o el tema base servido "a ciegas" NO son el último
	// tema activo: guardarlos pintaría eso encima en la próxima caída.
	test.each(["preview", "fallback"] as const)(
		"ignores a theme whose origin is %s",
		(origin) => {
			const { storage, data } = createStorage();

			rememberActiveTheme(storage, resolved({ origin }));

			expect(data.size).toBe(0);
		},
	);

	test("keeps the other modes of the same theme", () => {
		const { storage, stored } = createStorage();
		const light = resolved({ mode: "light" });
		const dark = resolved({ mode: "dark" });

		rememberActiveTheme(storage, light);
		rememberActiveTheme(storage, dark);

		expect(stored().css).toEqual({ light: light.css, dark: dark.css });
	});

	// Si no, al cambiar de modo sin conexión se pintaría el tema VIEJO.
	test("drops the other modes when the theme changes", () => {
		const { storage, stored } = createStorage();

		rememberActiveTheme(storage, resolved({ mode: "light" }));
		const next = resolved({ mode: "dark", tokens: tokensWith("0.5rem") });
		rememberActiveTheme(storage, next);

		expect(stored()).toEqual({
			v: 1,
			fingerprint: next.fingerprint,
			css: { dark: next.css },
		});
	});

	// Lo normal es que cada navegación traiga el mismo tema.
	test("does not rewrite what is already stored", () => {
		const { storage } = createStorage();
		const setItem = vi.spyOn(storage, "setItem");
		const theme = resolved();

		rememberActiveTheme(storage, theme);
		rememberActiveTheme(storage, theme);

		expect(setItem).toHaveBeenCalledTimes(1);
	});

	test.each([
		["corrupt JSON", "{ nope"],
		["another version", JSON.stringify({ v: 2, fingerprint: "x", css: {} })],
		["no css", JSON.stringify({ v: 1, fingerprint: "x", css: null })],
	])("replaces a stored value with %s", (_name, raw) => {
		const { storage, stored } = createStorage({
			[LAST_KNOWN_THEME_STORAGE_KEY]: raw,
		});
		const theme = resolved();

		rememberActiveTheme(storage, theme);

		expect(stored().css).toEqual({ light: theme.css });
	});

	// Cuota llena o modo privado: se pierde la red, no la página.
	test("swallows a storage that refuses writes", () => {
		const { storage, failWrites } = createStorage();
		failWrites();

		expect(() => rememberActiveTheme(storage, resolved())).not.toThrow();
	});
});

describe("applyLastKnownThemeFor", () => {
	const seeded = (css: Record<string, string>) =>
		createStorage({
			[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({
				v: 1,
				fingerprint: "x",
				css,
			}),
		});

	// Justo detrás del `<style>` del servidor: la misma posición en la cascada que
	// tendría el tema si el servidor lo hubiera conocido.
	test("paints the stored CSS right after the server style", () => {
		const { storage } = seeded({ dark: ":root{--radius:9px}" });
		const { head } = install(storage);

		expect(applyLastKnownThemeFor("dark")).toBe(true);

		expect(head.map((node) => node.id)).toEqual([
			THEME_STYLE_ID,
			LAST_KNOWN_THEME_STYLE_ID,
			"links",
		]);
		expect(head[1]?.textContent).toBe(":root{--radius:9px}");
	});

	test("reuses the style it already painted instead of stacking another", () => {
		const { storage } = seeded({ light: "a" });
		const { head } = install(storage);

		applyLastKnownThemeFor("light");
		applyLastKnownThemeFor("light");

		expect(
			head.filter((node) => node.id === LAST_KNOWN_THEME_STYLE_ID),
		).toHaveLength(1);
	});

	test("appends to the head when the server style is not there", () => {
		const { storage } = seeded({ light: "a" });
		const { head } = install(storage, { withBaseStyle: false });

		expect(applyLastKnownThemeFor("light")).toBe(true);
		expect(head.map((node) => node.id)).toEqual([LAST_KNOWN_THEME_STYLE_ID]);
	});

	// Cualquier CSS del mismo tema es mejor que perder la marca.
	test.each([
		["system when the mode is missing", { system: "s", light: "l" }, "s"],
		["light after system", { light: "l" }, "l"],
		["dark as the last resort", { dark: "d" }, "d"],
	])("falls back to %s", (_name, css, expected) => {
		const { storage } = seeded(css);
		const { head } = install(storage);

		// Se pide un modo que no está guardado en ninguno de los tres casos.
		applyLastKnownThemeFor(expected === "d" ? "light" : "dark");

		expect(head[1]?.textContent).toBe(expected);
	});

	test.each([
		["nothing stored", createStorage()],
		[
			"corrupt JSON",
			createStorage({ [LAST_KNOWN_THEME_STORAGE_KEY]: "{ nope" }),
		],
		[
			"another version",
			createStorage({
				[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({ v: 2, css: {} }),
			}),
		],
		[
			"css that is not an object",
			createStorage({
				[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({ v: 1, css: "x" }),
			}),
		],
		[
			"no usable CSS",
			createStorage({
				[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({
					v: 1,
					css: { light: "", dark: 7 },
				}),
			}),
		],
		[
			"an absurdly large value",
			createStorage({
				[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({
					v: 1,
					css: { light: "x".repeat(100_001) },
				}),
			}),
		],
	])("paints nothing with %s", (_name, { storage }) => {
		const { head } = install(storage);

		expect(applyLastKnownThemeFor("light")).toBe(false);
		expect(head).toHaveLength(2);
	});

	// `localStorage` puede lanzar solo con tocarlo (cookies bloqueadas).
	test("paints nothing when the storage throws", () => {
		vi.stubGlobal("window", {
			get localStorage(): Storage {
				throw new Error("SecurityError");
			},
		});
		vi.stubGlobal("document", createDocument().document);

		expect(applyLastKnownThemeFor("light")).toBe(false);
	});
});

describe("clearLastKnownTheme", () => {
	test("removes what was painted, and is a no-op otherwise", () => {
		const { storage } = createStorage({
			[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({
				v: 1,
				css: { light: "a" },
			}),
		});
		const { head } = install(storage);

		applyLastKnownThemeFor("light");
		clearLastKnownTheme();
		clearLastKnownTheme();

		expect(head.map((node) => node.id)).toEqual([THEME_STYLE_ID, "links"]);
	});
});

describe("lastKnownThemeScript", () => {
	// La garantía importante: el script inline corre SIN el bundle. Si la función
	// serializada se refiriera a algo de fuera de su cuerpo, aquí fallaría.
	test("is self-contained and paints the stored theme when evaluated", () => {
		const { storage } = createStorage({
			[LAST_KNOWN_THEME_STORAGE_KEY]: JSON.stringify({
				v: 1,
				css: { dark: ":root{--radius:3px}" },
			}),
		});
		const { head } = install(storage);

		new Function(lastKnownThemeScript("dark"))();

		expect(head[1]?.id).toBe(LAST_KNOWN_THEME_STYLE_ID);
		expect(head[1]?.textContent).toBe(":root{--radius:3px}");
	});

	test("interpolates every argument through JSON", () => {
		expect(lastKnownThemeScript("system")).toContain(
			`(${JSON.stringify(LAST_KNOWN_THEME_STORAGE_KEY)},${JSON.stringify(LAST_KNOWN_THEME_STYLE_ID)},${JSON.stringify(THEME_STYLE_ID)},"system",100000)`,
		);
	});
});
