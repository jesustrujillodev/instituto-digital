import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "@/shared/logging/logger";
import { toThemeTokens } from "../domain/theme.mapper";
import type { IActiveThemeSnapshot } from "../domain/theme.repository";
import type { ActiveTheme } from "../domain/theme.types";

type Dependencies = {
	/** Ruta del archivo JSON. Ver `THEME_SNAPSHOT_PATH` en env.server.ts. */
	path: string;
	logger: Logger;
};

/**
 * Versión del formato del archivo. Un archivo de otra versión se trata como
 * "sin copia": la base lo reescribe en cuanto vuelva a responder.
 */
const SNAPSHOT_VERSION = 1;

interface SnapshotFile {
	version: typeof SNAPSHOT_VERSION;
	savedAt: string;
	theme: ActiveTheme | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/**
 * El contenido del archivo NO se confía: pudo editarse a mano o quedar de una
 * versión anterior del esquema de tokens. Pasa por el mismo validador que la
 * columna `Json` de la base.
 */
const parseSnapshot = (raw: string): ActiveTheme | null | undefined => {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return undefined;
	}

	if (!isRecord(data) || data.version !== SNAPSHOT_VERSION) return undefined;
	if (data.theme === null) return null;
	if (!isRecord(data.theme)) return undefined;

	const { documentId, name, tokens } = data.theme;
	if (typeof documentId !== "string" || typeof name !== "string") {
		return undefined;
	}

	const valid = toThemeTokens(tokens);
	return valid ? { documentId, name, tokens: valid } : undefined;
};

const isMissingFile = (error: unknown): boolean =>
	isRecord(error) && error.code === "ENOENT";

/**
 * Snapshot del tema activo en un archivo local.
 *
 * Un archivo y no la base ni el storage de objetos: la copia tiene que estar
 * disponible justamente cuando lo remoto no lo está.
 */
export const createFileThemeSnapshot = ({
	path,
	logger,
}: Dependencies): IActiveThemeSnapshot => {
	const log = logger.child({ module: "theme", layer: "snapshot" });

	return {
		async read() {
			let raw: string;
			try {
				raw = await readFile(path, "utf8");
			} catch (error) {
				// Que no exista es lo normal antes de la primera lectura con éxito.
				if (!isMissingFile(error)) {
					log.warn("theme snapshot could not be read", {
						path,
						message: error instanceof Error ? error.message : String(error),
					});
				}
				return undefined;
			}

			const theme = parseSnapshot(raw);
			if (theme === undefined) {
				log.warn("theme snapshot is unreadable — ignoring it", { path });
			}
			return theme;
		},

		async write(theme) {
			const file: SnapshotFile = {
				version: SNAPSHOT_VERSION,
				savedAt: new Date().toISOString(),
				theme,
			};

			// Escritura ATÓMICA: se escribe al lado y se renombra encima. Un corte a
			// mitad deja el archivo anterior intacto en vez de un JSON truncado, que
			// es justo lo que se leería en el peor momento.
			const temporary = `${path}.${process.pid}.tmp`;
			await mkdir(dirname(path), { recursive: true });
			await writeFile(temporary, JSON.stringify(file), "utf8");
			await rename(temporary, path);
		},
	};
};
