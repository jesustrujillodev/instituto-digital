import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Plan anual — lo consulta el alcance global y lo gestionan el titular y los
 * auxiliares (impuesto con `requireScope` y `canManagePlans`).
 */
export const annualPlanRoutes = [
	route("plan-anual", "modules/annual-plan/routes/plan-anual/index.tsx"),
	route(
		"plan-anual/:documentId",
		"modules/annual-plan/routes/plan-anual/$documentId/index.tsx",
	),
] satisfies RouteConfigEntry[];
