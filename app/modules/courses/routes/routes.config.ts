import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Administración de cursos — superadministrador, titular, auxiliar y capacitador
 * interno (impuesto en cada loader y action con `requireCourseScope`).
 */
export const coursesRoutes = [
	route("capacitaciones", "modules/courses/routes/cursos/index.tsx"),
	route(
		"capacitaciones/nuevo",
		"modules/courses/routes/cursos/nuevo/index.tsx",
	),
	route(
		"capacitaciones/:documentId/nuevo/:paso",
		"modules/courses/routes/cursos/$documentId.nuevo.$paso/index.tsx",
	),
	route(
		"capacitaciones/:documentId",
		"modules/courses/routes/cursos/$documentId/index.tsx",
	),
	route(
		"capacitaciones/:documentId/editar/:paso?",
		"modules/courses/routes/cursos/$documentId.editar.$paso/index.tsx",
	),
] satisfies RouteConfigEntry[];
