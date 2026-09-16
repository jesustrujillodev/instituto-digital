import { index, type RouteConfigEntry } from "@react-router/dev/routes";

export const dashboardRoutes = [
	index("modules/dashboard/routes/home/index.tsx"),
] satisfies RouteConfigEntry[];
