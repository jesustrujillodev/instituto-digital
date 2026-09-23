import { index, type RouteConfigEntry, route } from "@react-router/dev/routes";

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
	// Sin componente: el panel del material la lee y le escribe con `useFetcher`.
	route(
		"cursos/:documentId/contenido/:lessonDocumentId",
		"modules/content/routes/cursos/$documentId.contenido.$lessonDocumentId/index.ts",
	),
	// Sin componente: el banco de un cuestionario, para quien lo arma. Lo leen y
	// le escriben el paso de Evaluación y el panel del temario (docs/adr/0015).
	route(
		"cursos/:documentId/cuestionario",
		"modules/content/routes/cursos/$documentId.cuestionario/index.ts",
	),
	// El aula del participante (docs/adr/0014): el índice lateral es el layout y
	// su índice redirige a la lección donde se quedó.
	route(
		"mis-cursos/:documentId/aula",
		"modules/content/routes/mis-cursos/$documentId.aula/index.tsx",
		[
			index(
				"modules/content/routes/mis-cursos/$documentId.aula._index/index.tsx",
			),
			route(
				"examen",
				"modules/content/routes/mis-cursos/$documentId.aula.examen/index.tsx",
			),
			route(
				":lessonDocumentId",
				"modules/content/routes/mis-cursos/$documentId.aula.$lessonDocumentId/index.tsx",
			),
		],
	),
] satisfies RouteConfigEntry[];
