import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * El temario de un curso.
 *
 * Es pantalla y es action: el paso Contenido del alta monta el mismo panel y
 * escribe contra esta ruta, así que las dos vías comparten intents y mensajes.
 */
export const contentRoutes = [
	route(
		"cursos/:documentId/contenido",
		"modules/content/routes/cursos/$documentId.contenido/index.tsx",
	),
] satisfies RouteConfigEntry[];
