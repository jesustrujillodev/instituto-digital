import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Solo actions: la definición vive en el paso Evaluación del curso y la captura
 * en la ficha de impartición; las dos envían con un `fetcher`.
 */
export const evaluationsRoutes = [
	route(
		"cursos/:documentId/evaluaciones",
		"modules/evaluations/routes/cursos/$documentId/evaluaciones/index.ts",
	),
	route(
		"imparticion/:documentId/evaluaciones",
		"modules/evaluations/routes/imparticion/$documentId/evaluaciones/index.ts",
	),
] satisfies RouteConfigEntry[];
