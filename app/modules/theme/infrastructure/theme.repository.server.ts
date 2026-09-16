import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { DEFAULT_THEME_TOKENS } from "../domain/theme.config";
import {
	ThemeNotFoundError,
	ThemePreferenceNotSavedError,
} from "../domain/theme.errors";
import { tokensEqual, toThemeTokens } from "../domain/theme.mapper";
import type { IThemeRepository } from "../domain/theme.repository";
import { isThemeMode } from "../domain/theme.rules";
import type {
	ActiveTheme,
	Theme,
	ThemeMode,
	ThemeTokens,
} from "../domain/theme.types";

type Dependencies = {
	prisma: ICradle["prisma"];
	logger: ICradle["logger"];
};

/** Fila única de `AppearanceState`, con el mismo patrón que `SecurityState`. */
const APPEARANCE_ROW_ID = 1;

/** El tipo que Prisma acepta para una columna `Json`. */
const asJson = (tokens: ThemeTokens) =>
	tokens as unknown as Prisma.InputJsonValue;

/** P2025: la fila ya no existe. Es el único error de Prisma que aquí se tipa. */
const isMissingRow = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2025";

export const createThemeRepository = ({
	prisma,
	logger,
}: Dependencies): IThemeRepository => {
	const log = logger.child({ module: "theme", layer: "repository" });

	/**
	 * Tokens de una columna `Json`, o el tema base si la fila no es legible.
	 *
	 * Una fila corrupta —escritura manual, esquema de tokens de una versión
	 * anterior— NO puede tumbar la plataforma entera: se registra y se sigue con
	 * el tema base. Es el mismo criterio con el que el módulo trata una cookie
	 * manipulada.
	 */
	const readTokens = (value: unknown, documentId: string): ThemeTokens => {
		const tokens = toThemeTokens(value);
		if (tokens) return tokens;

		log.error("theme tokens are unreadable — falling back to the base theme", {
			documentId,
		});
		return DEFAULT_THEME_TOKENS;
	};

	const findActiveDocumentId = async (): Promise<string | null> => {
		const state = await prisma.appearanceState.findUnique({
			where: { id: APPEARANCE_ROW_ID },
			select: { activeTheme: { select: { documentId: true } } },
		});

		return state?.activeTheme?.documentId ?? null;
	};

	/** Id numérico interno. No sale nunca del repositorio: fuera se usa el uuid. */
	const requireInternalId = async (documentId: string): Promise<number> => {
		const row = await prisma.theme.findUnique({
			where: { documentId },
			select: { id: true },
		});

		if (!row) throw new ThemeNotFoundError(documentId);
		return row.id;
	};

	const update = async (
		documentId: string,
		data: Prisma.ThemeUpdateInput,
	): Promise<void> => {
		try {
			await prisma.theme.update({ where: { documentId }, data });
		} catch (error) {
			if (isMissingRow(error)) throw new ThemeNotFoundError(documentId);
			throw error;
		}
	};

	return {
		// ── Preferencia de modo por usuario ────────────────────────────────────
		async findModeByUserId(userId) {
			const row = await prisma.user.findUnique({
				where: { id: userId },
				select: { themeMode: true },
			});

			// La columna es un `String?` libre. Un valor que el dominio no reconoce
			// —resto de una versión anterior, escritura manual— se trata como "sin
			// preferencia" en vez de propagarse: el peor desenlace es el tema por
			// defecto. Mismo criterio que `toLockdownScope` en el módulo auth.
			return isThemeMode(row?.themeMode) ? row.themeMode : null;
		},

		async saveMode(userId: number, mode: ThemeMode) {
			try {
				await prisma.user.update({
					where: { id: userId },
					data: { themeMode: mode },
				});
			} catch (error) {
				// P2025: la cuenta ya no existe (archivada y purgada mientras la sesión
				// seguía viva). El error tipado deja que el adaptador diga la verdad —la
				// cookie sí se guardó, la cuenta no— en vez de un fallo genérico.
				if (isMissingRow(error)) throw new ThemePreferenceNotSavedError();
				throw error;
			}
		},

		// ── Biblioteca de temas ────────────────────────────────────────────────
		async findActiveTheme(): Promise<ActiveTheme | null> {
			const state = await prisma.appearanceState.findUnique({
				where: { id: APPEARANCE_ROW_ID },
				select: {
					activeTheme: {
						select: { documentId: true, name: true, publishedTokens: true },
					},
				},
			});

			const active = state?.activeTheme;
			// Sin fila de apariencia, sin tema activo, o con un activo que perdió su
			// publicado: en los tres casos la app sirve el tema base y sigue.
			if (!active || active.publishedTokens === null) return null;

			return {
				documentId: active.documentId,
				name: active.name,
				tokens: readTokens(active.publishedTokens, active.documentId),
			};
		},

		async listThemes() {
			const [rows, activeDocumentId] = await Promise.all([
				prisma.theme.findMany({
					// Los presets primero: son el punto de partida, y quien entra por
					// primera vez tiene que verlos antes que sus propios experimentos.
					orderBy: [{ isPreset: "desc" }, { createdAt: "asc" }],
					select: {
						documentId: true,
						name: true,
						isPreset: true,
						draftTokens: true,
						publishedTokens: true,
					},
				}),
				findActiveDocumentId(),
			]);

			return rows.map((row) => {
				const published =
					row.publishedTokens === null
						? null
						: readTokens(row.publishedTokens, row.documentId);

				return {
					documentId: row.documentId,
					name: row.name,
					isPreset: row.isPreset,
					isActive: row.documentId === activeDocumentId,
					isPublished: published !== null,
					hasUnpublishedChanges:
						published !== null &&
						!tokensEqual(
							readTokens(row.draftTokens, row.documentId),
							published,
						),
				};
			});
		},

		async findTheme(documentId): Promise<Theme | null> {
			const row = await prisma.theme.findUnique({ where: { documentId } });
			if (!row) return null;

			return {
				documentId: row.documentId,
				name: row.name,
				isPreset: row.isPreset,
				draftTokens: readTokens(row.draftTokens, row.documentId),
				publishedTokens:
					row.publishedTokens === null
						? null
						: readTokens(row.publishedTokens, row.documentId),
				publishedAt: row.publishedAt,
			};
		},

		async createTheme({ name, tokens }) {
			const row = await prisma.theme.create({
				data: { name, draftTokens: asJson(tokens) },
			});

			return {
				documentId: row.documentId,
				name: row.name,
				isPreset: row.isPreset,
				draftTokens: tokens,
				publishedTokens: null,
				publishedAt: null,
			};
		},

		async renameTheme(documentId, name) {
			await update(documentId, { name });
		},

		async saveDraft(documentId, tokens) {
			await update(documentId, { draftTokens: asJson(tokens) });
		},

		async publishTheme(documentId, tokens) {
			await update(documentId, {
				publishedTokens: asJson(tokens),
				publishedAt: new Date(),
			});
		},

		async activateTheme(documentId) {
			const id = await requireInternalId(documentId);

			// `upsert` sobre la fila única: no hay que sembrarla aparte, y "un solo
			// tema activo" es cierto por construcción — una fila, una FK.
			await prisma.appearanceState.upsert({
				where: { id: APPEARANCE_ROW_ID },
				update: { activeThemeId: id },
				create: { id: APPEARANCE_ROW_ID, activeThemeId: id },
			});
		},

		async deleteTheme(documentId) {
			try {
				await prisma.theme.delete({ where: { documentId } });
			} catch (error) {
				if (isMissingRow(error)) throw new ThemeNotFoundError(documentId);
				throw error;
			}
		},
	};
};
