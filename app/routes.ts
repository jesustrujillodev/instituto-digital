import { layout, prefix, type RouteConfig } from "@react-router/dev/routes";
import {
	authAdminRoutes,
	authRoutes,
} from "./modules/auth/routes/routes.config";
import { cloudAdminRoutes } from "./modules/cloud/routes/routes.config";
import { dashboardRoutes } from "./modules/dashboard/routes/routes.config";
import { dependenciesRoutes } from "./modules/dependencies/routes/routes.config";
import { groupsRoutes } from "./modules/groups/routes/routes.config";
import { homeRoutes } from "./modules/home/routes/routes.config";
import {
	themeAdminRoutes,
	themeRoutes,
} from "./modules/theme/routes/routes.config";
import { trainersRoutes } from "./modules/trainers/routes/routes.config";
import { usersRoutes } from "./modules/users/routes/routes.config";
import { DASHBOARD_LAYOUT_ID } from "./shared/layout/layout.constants";
import { storageRoutes } from "./shared/storage/routes.config";

export default [
	// ══════════════════════════════════════════════════════════════════════════
	// ZONA 1 — Público / landing (sin sesión)
	// ══════════════════════════════════════════════════════════════════════════
	...homeRoutes,
	...authRoutes,
	...themeRoutes, // /preferencia-tema — el toggle vive también en landing y login

	// ══════════════════════════════════════════════════════════════════════════
	// ZONA 2 — Dashboard protegido (/dashboard/*)
	//   layout externo → shell (nav filtrada por rol) + requireAuth. El gate es
	//                    ESTRUCTURAL: lo protegido es lo que está aquí dentro, no
	//                    una lista de rutas públicas que pueda desincronizarse.
	//   layout interno → SOLO ErrorBoundary. React Router renderiza el boundary
	//                    EN LUGAR del elemento de la ruta que lo declara, así que
	//                    si viviera en el shell un error de ruta hija lo borraría.
	//                    Un nivel más abajo, el error se pinta DENTRO del shell.
	// ══════════════════════════════════════════════════════════════════════════
	layout(
		"shared/layout/routes/dashboard.layout.tsx",
		{ id: DASHBOARD_LAYOUT_ID },
		[
			layout("shared/layout/routes/dashboard.boundary.tsx", [
				...prefix("dashboard", [
					...dashboardRoutes, // /dashboard
					...dependenciesRoutes, // /dashboard/dependencias  (SUPERADMIN)
					...usersRoutes, // /dashboard/usuarios  (gestión con alcance)
					...trainersRoutes, // /dashboard/capacitadores  (catálogo global)
					...groupsRoutes, // /dashboard/grupos  (alcance por dependencia)
					...cloudAdminRoutes, // /dashboard/nube  (ADMIN)
					...authAdminRoutes, // /dashboard/sesiones  (ADMIN)
					...themeAdminRoutes, // /dashboard/personalizacion  (ADMIN)
				]),
			]),
		],
	),

	// ══════════════════════════════════════════════════════════════════════════
	// Infraestructura — resource routes sin UI (auth mixta por prefijo)
	// ══════════════════════════════════════════════════════════════════════════
	...storageRoutes,
] satisfies RouteConfig;
