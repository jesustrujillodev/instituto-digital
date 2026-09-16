import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** Zona pública: entrar y salir. Sin sesión previa exigida. */
export const authRoutes = [
	route("iniciar-sesion", "modules/auth/routes/iniciar-sesion/index.tsx"),
	route("cerrar-sesion", "modules/auth/routes/cerrar-sesion/index.action.ts"),
	route(
		"cerrar-sesiones",
		"modules/auth/routes/cerrar-sesiones/index.action.ts",
	),
];

/**
 * Zona protegida: administración de las sesiones de terceros.
 *
 * Array aparte de `authRoutes` porque se monta en otro sitio del árbol — dentro
 * del layout del dashboard, que impone la autenticación de forma estructural.
 * El rol lo impone además cada loader y action con `requireRole(["ADMIN"])`.
 */
export const authAdminRoutes = [
	route("sesiones", "modules/auth/routes/sesiones/index.tsx"),
] satisfies RouteConfigEntry[];
