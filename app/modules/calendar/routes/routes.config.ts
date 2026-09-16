import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/** Abierta a toda sesión: el servicio recorta lo que cada quien ve. */
export const calendarRoutes = [
	route("calendario", "modules/calendar/routes/calendario/index.tsx"),
] satisfies RouteConfigEntry[];
