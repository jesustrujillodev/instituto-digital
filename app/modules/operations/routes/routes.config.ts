import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** Dentro del layout del dashboard; el rol lo impone el loader con `OPERATIONS_ROLES`. */
export const operationsRoutes = [
	route("operacion", "modules/operations/routes/operacion/index.tsx"),
] satisfies RouteConfigEntry[];
