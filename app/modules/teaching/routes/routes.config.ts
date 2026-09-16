import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Pase de lista, resultados y cierre — quien imparte, la dependencia
 * organizadora y el alcance global (impuesto con `requireTeaching`).
 */
export const teachingRoutes = [
	route("imparticion", "modules/teaching/routes/imparticion/index.tsx"),
	route(
		"imparticion/:documentId",
		"modules/teaching/routes/imparticion/$documentId/index.tsx",
	),
] satisfies RouteConfigEntry[];
