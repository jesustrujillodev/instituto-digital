import type { AppResponse } from "@/shared/response/response.types";
import type {
	CloneThemeDto,
	CreateThemeDto,
	ImportThemeCssDto,
	RenameThemeDto,
	ResolvedTheme,
	SaveDraftDto,
	Theme,
	ThemeMode,
	ThemeModeResponse,
	ThemeSummary,
	ThemeTargetDto,
} from "./theme.types";

export interface IThemeService {
	/**
	 * Modo efectivo y CSS listo para inyectar en el `<head>`.
	 *
	 * Lo consume el loader raíz, así que corre en TODA petición: el tema activo
	 * sale de la caché de proceso y la columna del usuario solo se consulta
	 * cuando hay sesión y la cookie no trae preferencia — el caso de un
	 * dispositivo nuevo, no el habitual.
	 *
	 * `previewDocumentId` viene de una cookie y por tanto no autoriza nada: se
	 * atiende solo si `canPreview` es cierto, y eso lo decide el ROL verificado
	 * en servidor. La cookie la puede fabricar cualquiera.
	 */
	resolve(input: {
		cookieMode: unknown;
		userId: number | null;
		previewDocumentId: unknown;
		canPreview: boolean;
	}): Promise<AppResponse<ResolvedTheme>>;

	/**
	 * Persiste la preferencia en la cuenta.
	 *
	 * `userId: null` (visitante anónimo) es un caso legítimo, no un error: la
	 * cookie que emite el adaptador ya guarda la preferencia, y no hay cuenta
	 * donde replicarla.
	 */
	setMode(input: {
		userId: number | null;
		mode: ThemeMode;
	}): Promise<ThemeModeResponse>;

	// ── Biblioteca (solo SUPERADMIN; el rol lo impone la ruta) ─────────────────────

	listThemes(): Promise<AppResponse<ThemeSummary[]>>;

	getTheme(input: ThemeTargetDto): Promise<AppResponse<Theme>>;

	/** Sin `fromDocumentId`, parte del tema base. */
	createTheme(input: CreateThemeDto): Promise<AppResponse<Theme>>;

	/** Única vía para partir de un preset de fábrica. */
	cloneTheme(input: CloneThemeDto): Promise<AppResponse<Theme>>;

	renameTheme(input: RenameThemeDto): Promise<AppResponse<null>>;

	/** Autosave del builder. */
	saveDraft(input: SaveDraftDto): Promise<AppResponse<null>>;

	/** Reemplaza el borrador con un tema pegado en CSS. */
	importThemeCss(input: ImportThemeCssDto): Promise<AppResponse<Theme>>;

	/** Copia `draftTokens` → `publishedTokens` y sella `publishedAt`. */
	publishTheme(input: ThemeTargetDto): Promise<AppResponse<null>>;

	/** Falla si el tema nunca se publicó: activarlo serviría tokens en edición. */
	activateTheme(input: ThemeTargetDto): Promise<AppResponse<null>>;

	/** Restaura `draftTokens` desde `publishedTokens`. */
	discardDraft(input: ThemeTargetDto): Promise<AppResponse<null>>;

	/** Prohibido sobre un preset y sobre el tema activo. */
	deleteTheme(input: ThemeTargetDto): Promise<AppResponse<null>>;
}
