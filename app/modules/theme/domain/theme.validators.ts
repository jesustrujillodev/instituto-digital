import * as v from "valibot";
import { themeRules } from "./theme.rules";

// Cada función valida y lanza ValiError si falla.
// El action decide cómo manejar el error (parseInput → envelope).

export const validateSetThemeMode = (data: unknown) =>
	v.parse(themeRules.setMode, data);
