import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** Solo action: el panel vive en la ficha de imparticion y envia con un `fetcher`. */
export const evaluationsRoutes = [
	route(
		"imparticion/:documentId/evaluaciones",
		"modules/evaluations/routes/imparticion/$documentId/evaluaciones/index.ts",
	),
] satisfies RouteConfigEntry[];
