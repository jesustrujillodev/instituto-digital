import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { LogData, Logger } from "@/shared/logging/logger";
import { DEFAULT_THEME_TOKENS } from "../../domain/theme.config";
import type { ActiveTheme } from "../../domain/theme.types";
import { createFileThemeSnapshot } from "../theme.snapshot.server";

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

const THEME: ActiveTheme = {
	documentId: "11111111-1111-4111-8111-111111111111",
	name: "Rose",
	tokens: {
		...DEFAULT_THEME_TOKENS,
		shared: { ...DEFAULT_THEME_TOKENS.shared, radius: "1.25rem" },
	},
};

let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "theme-snapshot-"));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

const build = (fileName = "nested/dir/active-theme.json") => {
	const path = join(directory, fileName);
	const { logger, entries } = createSpyLogger();
	return {
		path,
		entries,
		snapshot: createFileThemeSnapshot({ path, logger }),
	};
};

describe("createFileThemeSnapshot", () => {
	// Crea los directorios que falten: la ruta por defecto (.cache/theme) no
	// existe en un checkout limpio.
	test("round-trips the active theme, creating the directory", async () => {
		const { snapshot } = build();

		await snapshot.write(THEME);

		expect(await snapshot.read()).toEqual(THEME);
	});

	// "No había tema activo" es un dato, distinto de "no hay copia".
	test("round-trips the absence of an active theme as null", async () => {
		const { snapshot } = build();

		await snapshot.write(null);

		expect(await snapshot.read()).toBeNull();
	});

	test("a missing file is 'no snapshot', silently", async () => {
		const { snapshot, entries } = build();

		expect(await snapshot.read()).toBeUndefined();
		expect(entries).toEqual([]);
	});

	test("overwrites the previous copy and leaves no temporary file behind", async () => {
		const { snapshot, path } = build("active-theme.json");

		await snapshot.write(THEME);
		await snapshot.write({ ...THEME, name: "Otro" });

		expect((await snapshot.read())?.name).toBe("Otro");
		expect(await readdir(directory)).toEqual(["active-theme.json"]);
		expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
	});

	// El archivo no se confía: pudo editarse a mano o quedar de un esquema de
	// tokens anterior. Ilegible es lo mismo que no tener copia — nunca lanza.
	test.each([
		["corrupt JSON", "{ no es json"],
		["another format version", JSON.stringify({ version: 2, theme: null })],
		["not an object", JSON.stringify("hola")],
		["a theme that is not an object", JSON.stringify({ version: 1, theme: 7 })],
		[
			"a theme without a documentId",
			JSON.stringify({
				version: 1,
				theme: { name: "x", tokens: DEFAULT_THEME_TOKENS },
			}),
		],
		[
			"a theme without a name",
			JSON.stringify({
				version: 1,
				theme: { documentId: "x", tokens: DEFAULT_THEME_TOKENS },
			}),
		],
		[
			"invalid tokens",
			JSON.stringify({
				version: 1,
				theme: { documentId: "x", name: "x", tokens: { light: {} } },
			}),
		],
	])("ignores a snapshot with %s, and logs it", async (_name, content) => {
		const { snapshot, path, entries } = build("active-theme.json");
		await writeFile(path, content, "utf8");

		expect(await snapshot.read()).toBeUndefined();
		expect(entries.some((entry) => entry.level === "warn")).toBe(true);
	});

	// Una ruta que es un directorio (o sin permisos) no es "no existe": se
	// registra para que alguien lo vea, pero tampoco lanza.
	test("logs a read error that is not a missing file", async () => {
		const { snapshot, entries } = build("");

		expect(await snapshot.read()).toBeUndefined();
		expect(entries.find((entry) => entry.level === "warn")?.data?.path).toBe(
			directory,
		);
	});

	test("propagates a write failure so the caller can log and retry it", async () => {
		// El "directorio" padre es un archivo: no se puede crear nada debajo.
		await writeFile(join(directory, "archivo"), "", "utf8");
		const { snapshot } = build("archivo/active-theme.json");

		await expect(snapshot.write(THEME)).rejects.toThrow();
	});
});
