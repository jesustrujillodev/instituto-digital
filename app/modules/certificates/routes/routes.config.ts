import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * El certificado de un curso: lo diseña quien lo administra (docs/adr/0018) y
 * lo descarga quien lo imparte (docs/adr/0019).
 */
export const certificatesRoutes = [
	route(
		"cursos/:documentId/certificado",
		"modules/certificates/routes/cursos/$documentId.certificado/index.tsx",
	),
	route(
		"cursos/:documentId/certificado/muestra",
		"modules/certificates/routes/cursos/$documentId.certificado.muestra/index.ts",
	),
	route(
		"certificados/:documentId/descargar",
		"modules/certificates/routes/certificados/$documentId.descargar/index.ts",
	),
] satisfies RouteConfigEntry[];
