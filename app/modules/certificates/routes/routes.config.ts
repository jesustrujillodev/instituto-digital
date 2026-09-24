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
	/** Los certificados propios de quien está en sesión (`requireAuth`). */
	route(
		"mis-certificados",
		"modules/certificates/routes/mis-certificados/index.tsx",
	),
	route(
		"mis-certificados/:documentId/descargar",
		"modules/certificates/routes/mis-certificados/$documentId.descargar/index.ts",
	),
] satisfies RouteConfigEntry[];

/**
 * La verificación pública, en la ZONA 1: sin sesión a propósito, porque la
 * consulta quien tiene el papel (docs/adr/0020).
 */
export const certificateVerificationRoutes = [
	route(
		"verificar/:documentId",
		"modules/certificates/routes/verificar/$documentId/index.tsx",
	),
] satisfies RouteConfigEntry[];
