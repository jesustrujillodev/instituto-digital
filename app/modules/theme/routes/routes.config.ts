import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Cambiar el esquema de color.
 *
 * Va fuera del dashboard porque el toggle también se ofrece en la landing y en
 * el login — exigir sesión para cambiar de tema no tendría sentido.
 */
export const themeRoutes = [
	route(
		"preferencia-tema",
		"modules/theme/routes/preferencia-tema/index.action.ts",
	),
] satisfies RouteConfigEntry[];
