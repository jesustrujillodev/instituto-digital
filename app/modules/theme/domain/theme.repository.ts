import type { ThemeMode } from "./theme.types";

/** Puerto de persistencia de la preferencia de modo por usuario. */
export interface IThemeRepository {
	/** Preferencia guardada en la cuenta. `null` si nunca eligió o no existe. */
	findModeByUserId(userId: number): Promise<ThemeMode | null>;

	/** Persiste la preferencia en la cuenta. Lanza si el usuario no existe. */
	saveMode(userId: number, mode: ThemeMode): Promise<void>;
}
