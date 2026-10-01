import { index, type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * El temario de un curso.
 *
 * Es pantalla y es action: el paso Contenido del alta monta el mismo panel y
 * escribe contra esta ruta, así que las dos vías comparten intents y mensajes.
 */
export const contentRoutes = [
	route(
		"capacitaciones/:documentId/contenido",
		"modules/content/routes/cursos/$documentId.contenido/index.tsx",
	),
	// Sin componente: el panel del material la lee y le escribe con `useFetcher`.
	route(
		"capacitaciones/:documentId/contenido/:lessonDocumentId",
		"modules/content/routes/cursos/$documentId.contenido.$lessonDocumentId/index.ts",
	),
	// Sin componente: el material de las sesiones, para quien administra o
	// imparte el curso (docs/adr/0026).
	route(
		"capacitaciones/:documentId/sesiones/material",
		"modules/content/routes/cursos/$documentId.sesiones.material/index.ts",
	),
	// Sin componente: el banco de un cuestionario, para quien lo arma. Lo leen y
	// le escriben el paso de Evaluación y el panel del temario (docs/adr/0015).
	route(
		"capacitaciones/:documentId/cuestionario",
		"modules/content/routes/cursos/$documentId.cuestionario/index.ts",
	),
	// Sin componente: quien imparte habilita otro intento desde la pestaña
	// Avance (docs/adr/0016) y abre o cierra el seguimiento (docs/adr/0027).
	route(
		"imparticion/:documentId/cuestionarios",
		"modules/content/routes/imparticion/$documentId.cuestionarios/index.ts",
	),
	// Una evaluación de seguimiento: se llega desde la pantalla del QR o desde
	// el detalle de la capacitación, no desde el aula (docs/adr/0027).
	route(
		"mis-capacitaciones/:documentId/seguimiento/:followUpDocumentId",
		"modules/content/routes/mis-cursos/$documentId.seguimiento.$followUpDocumentId/index.tsx",
	),
	// El aula del participante (docs/adr/0014): el índice lateral es el layout y
	// su índice redirige a la lección donde se quedó.
	route(
		"mis-capacitaciones/:documentId/aula",
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
				"modulo/:moduleDocumentId",
				"modules/content/routes/mis-cursos/$documentId.aula.modulo.$moduleDocumentId/index.tsx",
			),
			route(
				":lessonDocumentId",
				"modules/content/routes/mis-cursos/$documentId.aula.$lessonDocumentId/index.tsx",
			),
		],
	),
] satisfies RouteConfigEntry[];
