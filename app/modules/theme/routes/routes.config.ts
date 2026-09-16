import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Zona pública: cambiar el esquema de color.
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

/**
 * Zona protegida: el theme builder.
 *
 * Array aparte porque se monta en otro sitio del árbol —dentro del layout del
 * dashboard, que impone la autenticación de forma estructural—. El rol lo impone
 * además el loader Y el action con `requireRole(["SUPERADMIN"])`: el tema es de la
 * plataforma, así que quien lo cambia lo cambia para todo el mundo.
 */
export const themeAdminRoutes = [
	route("personalizacion", "modules/theme/routes/personalizacion/index.tsx"),
] satisfies RouteConfigEntry[];
