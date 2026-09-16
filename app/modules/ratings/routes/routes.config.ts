import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** Solo action: el formulario vive en "Mis cursos" y envía con un `fetcher`. */
export const ratingsRoutes = [
	route(
		"mis-cursos/:documentId/valorar",
		"modules/ratings/routes/valorar/index.ts",
	),
] satisfies RouteConfigEntry[];
