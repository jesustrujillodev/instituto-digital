import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * GET /inscripcion/:token — escaneo del QR de inscripción. Va en ZONA 1, fuera
 * del layout del dashboard: quien escanea puede no traer sesión, y esta ruta se
 * la impone ella misma conservando el token en el `redirectTo` del login.
 */
export const enrollmentQrRoutes = [
	route(
		"inscripcion/:token",
		"modules/enrollment-qr/routes/inscripcion/$token/index.tsx",
	),
] satisfies RouteConfigEntry[];
