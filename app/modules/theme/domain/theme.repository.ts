import type {
	ActiveTheme,
	Theme,
	ThemeMode,
	ThemeSummary,
	ThemeTokens,
} from "./theme.types";

/**
 * Puerto de persistencia del módulo.
 *
 * Cubre dos cosas de alcance muy distinto: la preferencia de MODO por usuario
 * (fase A) y la biblioteca de TEMAS de la plataforma (fase B). Van juntas
 * porque las gobierna el mismo servicio, no porque se parezcan.
 *
 * `findActiveTheme` es el único método que corre en toda petición, y por eso es
 * el único que el decorador de caché retiene (theme.cache.server.ts).
 */
export interface IThemeRepository {
	// ── Preferencia de modo por usuario ──────────────────────────────────────
	/** Preferencia guardada en la cuenta. `null` si nunca eligió o no existe. */
	findModeByUserId(userId: number): Promise<ThemeMode | null>;

	/** Persiste la preferencia en la cuenta. Lanza si el usuario no existe. */
	saveMode(userId: number, mode: ThemeMode): Promise<void>;

	// ── Biblioteca de temas ──────────────────────────────────────────────────
	/**
	 * Tema que la plataforma sirve ahora mismo. `null` si no se ha activado
	 * ninguno: la app cae al tema base y sigue funcionando.
	 */
	findActiveTheme(): Promise<ActiveTheme | null>;

	/** Resumen de la biblioteca, sin tokens. Ordenado: presets primero. */
	listThemes(): Promise<ThemeSummary[]>;

	/** Un tema completo con sus dos juegos de tokens. `null` si no existe. */
	findTheme(documentId: string): Promise<Theme | null>;

	createTheme(input: { name: string; tokens: ThemeTokens }): Promise<Theme>;

	renameTheme(documentId: string, name: string): Promise<void>;

	saveDraft(documentId: string, tokens: ThemeTokens): Promise<void>;

	/** Copia el borrador a publicado y sella `publishedAt`. */
	publishTheme(documentId: string, tokens: ThemeTokens): Promise<void>;

	/** `upsert` sobre la fila única de `AppearanceState`. */
	activateTheme(documentId: string): Promise<void>;

	deleteTheme(documentId: string): Promise<void>;
}

/**
 * Última copia conocida del tema activo, FUERA de la base de datos.
 *
 * Existe para que un proceso que arranca con la base caída —reinicio, deploy,
 * recarga del dev server— siga sirviendo el tema de la plataforma en vez del
 * tema base. La escribe y la lee solo el decorador de caché
 * (theme.cache.server.ts); el resto del módulo no sabe que existe.
 */
export interface IActiveThemeSnapshot {
	/**
	 * `undefined` = no hay copia utilizable (no existe o está corrupta).
	 * `null` = la copia dice que NO había tema activo, que también es un dato.
	 *
	 * No lanza: una copia ilegible es lo mismo que no tener copia.
	 */
	read(): Promise<ActiveTheme | null | undefined>;

	write(theme: ActiveTheme | null): Promise<void>;
}
