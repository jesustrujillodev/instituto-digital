import { type RouteConfigEntry, route } from "@react-router/dev/routes";

/**
 * Gestor de archivos en la nube — solo SUPERADMIN (impuesto en loader y action).
 *
 * Va en la ZONA 3 de app/routes.ts. La carpeta abierta viaja en la URL
 * (`?path=media/curso-induccion-2026/`), así que atrás/adelante y los enlaces
 * compartidos abren la misma carpeta.
 */
export const cloudAdminRoutes = [
	// GET  /dashboard/nube?path=…&cursor=…   → un nivel de carpeta
	// POST /dashboard/nube                   → descargar, ZIP, borrar, huérfanos
	route("nube", "modules/cloud/routes/nube/index.tsx"),
] satisfies RouteConfigEntry[];
