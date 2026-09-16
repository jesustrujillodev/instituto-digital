import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Grupos de una dependencia. El guard de rol abre la lectura al
 * superadministrador; la escritura la corta el alcance, que tiene que ser de
 * dependencia. Ambos se imponen en cada loader y action.
 */
export const groupsRoutes = [
	route("grupos", "modules/groups/routes/grupos/index.tsx"),
	route("grupos/nuevo", "modules/groups/routes/grupos/nuevo/index.tsx"),
	route(
		"grupos/:documentId/editar",
		"modules/groups/routes/grupos/$documentId.editar/index.tsx",
	),
] satisfies RouteConfigEntry[];
