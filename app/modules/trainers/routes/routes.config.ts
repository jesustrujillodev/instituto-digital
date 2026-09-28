import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * El perfil de capacitador se administra desde `/dashboard/usuarios`: el alta
 * del externo y las mutaciones del perfil cuelgan de esa pantalla. Las dos
 * rutas exigen `TRAINER_ADMIN_ROLES`; alcance y rango los decide el servicio.
 */
export const trainersRoutes = [
	route(
		"usuarios/capacitador-externo",
		"modules/trainers/routes/usuarios/capacitador-externo/index.tsx",
	),
	// Solo action: la tabla y el panel de usuarios envían con un `fetcher`.
	route(
		"usuarios/:documentId/perfil-capacitador",
		"modules/trainers/routes/usuarios/$documentId/perfil-capacitador/index.ts",
	),
] satisfies RouteConfigEntry[];
