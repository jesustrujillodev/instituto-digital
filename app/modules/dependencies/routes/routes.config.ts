import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** Alta y administración de dependencias — solo SUPERADMIN (impuesto en cada loader y action). */
export const dependenciesRoutes = [
	route("dependencias", "modules/dependencies/routes/dependencias/index.tsx"),
	route(
		"dependencias/nueva",
		"modules/dependencies/routes/dependencias/nueva/index.tsx",
	),
	route(
		"dependencias/:documentId/editar",
		"modules/dependencies/routes/dependencias/$documentId.editar/index.tsx",
	),
] satisfies RouteConfigEntry[];
