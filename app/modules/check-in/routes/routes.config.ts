import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Pantalla del escaneo del QR. Va en ZONA 1, fuera del layout del dashboard:
 * quien escanea puede no traer sesión, y esta ruta se la impone ella misma
 * conservando el token en el `redirectTo` del login.
 */
export const checkInRoutes = [
	route(
		"asistencia/:token",
		"modules/check-in/routes/asistencia/$token/index.tsx",
	),
] satisfies RouteConfigEntry[];
