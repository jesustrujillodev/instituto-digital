import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Catálogo de capacitadores. La lectura la abre `canViewCatalog` —cualquier
 * capacitador entra, tenga el rol que tenga— y las mutaciones exigen
 * `TRAINER_ADMIN_ROLES`; ambos se imponen en cada loader y action.
 */
export const trainersRoutes = [
	route("capacitadores", "modules/trainers/routes/capacitadores/index.tsx"),
	route(
		"capacitadores/nuevo",
		"modules/trainers/routes/capacitadores/nuevo/index.tsx",
	),
	route(
		"capacitadores/:documentId/editar",
		"modules/trainers/routes/capacitadores/$documentId.editar/index.tsx",
	),
] satisfies RouteConfigEntry[];
