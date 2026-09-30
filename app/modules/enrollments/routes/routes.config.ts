import { type RouteConfigEntry, route } from "@react-router/dev/routes";

export const enrollmentsRoutes = [
	route(
		"catalogo-de-capacitaciones",
		"modules/enrollments/routes/cursos-disponibles/index.tsx",
	),
	route(
		"catalogo-de-capacitaciones/:documentId",
		"modules/enrollments/routes/cursos-disponibles/$documentId/index.tsx",
	),
	route(
		"mis-capacitaciones",
		"modules/enrollments/routes/mis-cursos/index.tsx",
	),
	route(
		"mis-capacitaciones/:documentId",
		"modules/enrollments/routes/mis-cursos/$documentId/index.tsx",
	),
	// Ruta de recurso: la descarga del Excel de la pestaña "Finalizados".
	route(
		"mis-capacitaciones/finalizados.xlsx",
		"modules/enrollments/routes/exportar-finalizados/index.ts",
	),
	route(
		"capacitaciones/:documentId/inscripciones",
		"modules/enrollments/routes/inscripciones/index.tsx",
	),
] satisfies RouteConfigEntry[];
