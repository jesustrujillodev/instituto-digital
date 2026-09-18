import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Administración de cursos — superadministrador, titular, auxiliar y capacitador
 * interno (impuesto en cada loader y action con `requireCourseScope`).
 */
export const coursesRoutes = [
	route("cursos", "modules/courses/routes/cursos/index.tsx"),
	route("cursos/nuevo", "modules/courses/routes/cursos/nuevo/index.tsx"),
	route(
		"cursos/:documentId/nuevo/:paso",
		"modules/courses/routes/cursos/$documentId.nuevo.$paso/index.tsx",
	),
	route(
		"cursos/:documentId",
		"modules/courses/routes/cursos/$documentId/index.tsx",
	),
	route(
		"cursos/:documentId/editar",
		"modules/courses/routes/cursos/$documentId.editar/index.tsx",
	),
] satisfies RouteConfigEntry[];
