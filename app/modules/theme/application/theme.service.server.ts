import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { DEFAULT_THEME_TOKENS } from "../domain/theme.config";
import {
	ThemeCssNotParseableError,
	ThemeNotFoundError,
} from "../domain/theme.errors";
import {
	parseThemeCss,
	themeCss,
	themeFingerprint,
} from "../domain/theme.mapper";
import {
	assertThemeDeletable,
	assertThemeEditable,
	assertThemePublished,
	isThemeMode,
	resolveThemeMode,
} from "../domain/theme.rules";
import type { IThemeService } from "../domain/theme.service";
import type {
	Theme,
	ThemeOrigin,
	ThemePreview,
	ThemeTokens,
} from "../domain/theme.types";
import { safeParseThemeTokens } from "../domain/theme.validators";

type Dependencies = {
	themeRepository: ICradle["themeRepository"];
	logger: ICradle["logger"];
};

export const createThemeService = ({
	themeRepository,
	logger,
}: Dependencies): IThemeService => {
	const log = logger.child({ module: "theme" });
	const run = createOperationRunner(log);

	/** El tema o un `ThemeNotFoundError` — nunca `null` colándose hacia abajo. */
	const requireTheme = async (documentId: string): Promise<Theme> => {
		const theme = await themeRepository.findTheme(documentId);
		if (!theme) throw new ThemeNotFoundError(documentId);
		return theme;
	};

	const activeThemeDocumentId = async (): Promise<string | null> =>
		(await themeRepository.findActiveTheme())?.documentId ?? null;

	return {
		resolve({ cookieMode, userId, previewDocumentId, canPreview }) {
			return run("resolve", async () => {
				// La cookie decide sola el MODO en el caso normal. Solo se baja a la
				// base cuando hay sesión y NO hay cookie —dispositivo nuevo o cookies
				// borradas—, así que esto no es una consulta por petición.
				let userMode: unknown = null;

				if (userId !== null && !isThemeMode(cookieMode)) {
					try {
						userMode = await themeRepository.findModeByUserId(userId);
					} catch (error) {
						// El tema NO es una decisión de seguridad: si la base no responde
						// se sirve el tema por defecto, no se tumba la página entera.
						log.warn("theme preference read failed — falling back", {
							message: error instanceof Error ? error.message : String(error),
						});
					}
				}

				const mode = resolveThemeMode(cookieMode, userMode);

				let tokens: ThemeTokens = DEFAULT_THEME_TOKENS;
				let preview: ThemePreview | null = null;
				let origin: ThemeOrigin = "fallback";

				try {
					// "Probar en toda la app": el gate es `canPreview`, que sale del rol
					// verificado en servidor. La cookie solo dice CUÁL tema, y eso puede
					// fabricarlo cualquiera — por sí sola no abre nada.
					if (canPreview && typeof previewDocumentId === "string") {
						const draft = await themeRepository.findTheme(previewDocumentId);
						if (draft) {
							tokens = draft.draftTokens;
							preview = { documentId: draft.documentId, name: draft.name };
							origin = "preview";
						}
					}

					if (!preview) {
						// La caché ya agotó sus respaldos (memoria y snapshot) antes de
						// lanzar, así que llegar al `catch` significa que este proceso no
						// conoce el tema activo.
						const active = await themeRepository.findActiveTheme();
						if (active) tokens = active.tokens;
						origin = "active";
					}
				} catch (error) {
					// Se sirve el tema base marcado como `fallback`: el navegador pinta
					// encima el último tema activo que conoció (last-known-theme.ts).
					// Degradar es correcto; denegar no.
					log.warn("active theme unknown — serving the base theme", {
						message: error instanceof Error ? error.message : String(error),
					});
				}

				return ok({
					mode,
					css: themeCss(tokens, mode),
					preview,
					origin,
					fingerprint: themeFingerprint(tokens),
				});
			});
		},

		setMode({ userId, mode }) {
			return run("setMode", async () => {
				// Anónimo: la cookie del adaptador ES la persistencia. No hay cuenta.
				if (userId !== null) {
					await themeRepository.saveMode(userId, mode);
				}

				return ok(null);
			});
		},

		listThemes() {
			return run("listThemes", async () =>
				ok(await themeRepository.listThemes()),
			);
		},

		getTheme({ documentId }) {
			return run("getTheme", async () => ok(await requireTheme(documentId)));
		},

		createTheme({ name, fromDocumentId }) {
			return run("createTheme", async () => {
				// Sin origen se parte del tema base. Con origen se copia su BORRADOR:
				// es lo que el admin estaba viendo al pulsar, no una versión anterior.
				const tokens = fromDocumentId
					? (await requireTheme(fromDocumentId)).draftTokens
					: DEFAULT_THEME_TOKENS;

				return ok(await themeRepository.createTheme({ name, tokens }));
			});
		},

		cloneTheme({ documentId, name }) {
			return run("cloneTheme", async () => {
				const source = await requireTheme(documentId);

				// Un clon NUNCA nace publicado, ni siquiera clonando un preset: lo que
				// se copia es material en edición hasta que alguien decida publicarlo.
				return ok(
					await themeRepository.createTheme({
						name,
						tokens: source.draftTokens,
					}),
				);
			});
		},

		renameTheme({ documentId, name }) {
			return run("renameTheme", async () => {
				assertThemeEditable(await requireTheme(documentId));
				await themeRepository.renameTheme(documentId, name);
				return ok(null);
			});
		},

		saveDraft({ documentId, tokens }) {
			return run("saveDraft", async () => {
				assertThemeEditable(await requireTheme(documentId));
				await themeRepository.saveDraft(documentId, tokens);
				return ok(null);
			});
		},

		importThemeCss({ documentId, css }) {
			return run("importThemeCss", async () => {
				const theme = await requireTheme(documentId);
				assertThemeEditable(theme);

				// El tema actual es la BASE del pegado: lo que el bloque no declara se
				// queda como estaba en vez de saltar al tema por defecto.
				const parsed = parseThemeCss(css, theme.draftTokens);

				// El parser es tolerante, pero lo que sale de él pasa por el mismo
				// esquema que cualquier otra entrada: un valor imposible no llega a la
				// base de datos por la puerta de atrás.
				const tokens = safeParseThemeTokens(parsed);
				if (!tokens) {
					throw new ThemeCssNotParseableError(
						"el resultado no compone un juego de tokens válido",
					);
				}

				await themeRepository.saveDraft(documentId, tokens);
				return ok(await requireTheme(documentId));
			});
		},

		publishTheme({ documentId }) {
			return run("publishTheme", async () => {
				const theme = await requireTheme(documentId);
				assertThemeEditable(theme);

				await themeRepository.publishTheme(documentId, theme.draftTokens);
				return ok(null);
			});
		},

		activateTheme({ documentId }) {
			return run("activateTheme", async () => {
				const theme = await requireTheme(documentId);
				assertThemePublished(theme);

				await themeRepository.activateTheme(documentId);
				return ok(null);
			});
		},

		discardDraft({ documentId }) {
			return run("discardDraft", async () => {
				const theme = await requireTheme(documentId);
				assertThemeEditable(theme);
				assertThemePublished(theme);

				// `assertThemePublished` es un `asserts`: aquí `publishedTokens` ya
				// está estrechado a no-nulo, sin un `??` de adorno detrás.
				await themeRepository.saveDraft(documentId, theme.publishedTokens);
				return ok(null);
			});
		},

		deleteTheme({ documentId }) {
			return run("deleteTheme", async () => {
				const theme = await requireTheme(documentId);
				assertThemeDeletable(theme, await activeThemeDocumentId());

				await themeRepository.deleteTheme(documentId);
				return ok(null);
			});
		},
	};
};
