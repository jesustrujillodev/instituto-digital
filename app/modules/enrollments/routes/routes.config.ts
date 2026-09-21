import { type RouteConfigEntry, route } from "@react-router/dev/routes";

export const enrollmentsRoutes = [
	route(
		"cursos-disponibles",
		"modules/enrollments/routes/cursos-disponibles/index.tsx",
	),
	route(
		"cursos-disponibles/:documentId",
		"modules/enrollments/routes/cursos-disponibles/$documentId/index.tsx",
	),
	route("mis-cursos", "modules/enrollments/routes/mis-cursos/index.tsx"),
	// Ruta de recurso: la descarga del Excel de la pestaña "Finalizados".
	route(
		"mis-cursos/finalizados.xlsx",
		"modules/enrollments/routes/exportar-finalizados/index.ts",
	),
	route(
		"cursos/:documentId/inscripciones",
		"modules/enrollments/routes/inscripciones/index.tsx",
	),
] satisfies RouteConfigEntry[];
