import type * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import type { setThemeModeRule, THEME_MODES } from "./theme.rules";

/** `"light" | "dark" | "system"`. Derivado de la tupla, nunca escrito a mano. */
export type ThemeMode = (typeof THEME_MODES)[number];

export type SetThemeModeDto = v.InferInput<typeof setThemeModeRule>;

/** Cambiar el modo no devuelve dato: el efecto es la cookie y la columna. */
export type ThemeModeResponse = AppResponse<null>;
