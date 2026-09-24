import { layout, prefix, type RouteConfig } from "@react-router/dev/routes";
import { annualPlanRoutes } from "./modules/annual-plan/routes/routes.config";
import {
	authAdminRoutes,
	authRoutes,
} from "./modules/auth/routes/routes.config";
import { calendarRoutes } from "./modules/calendar/routes/routes.config";
import {
	certificatesRoutes,
	certificateVerificationRoutes,
} from "./modules/certificates/routes/routes.config";
import { checkInRoutes } from "./modules/check-in/routes/routes.config";
import { cloudAdminRoutes } from "./modules/cloud/routes/routes.config";
import { contentRoutes } from "./modules/content/routes/routes.config";
import { coursesRoutes } from "./modules/courses/routes/routes.config";
import { creditsRoutes } from "./modules/credits/routes/routes.config";
import { dashboardRoutes } from "./modules/dashboard/routes/routes.config";
import { dependenciesRoutes } from "./modules/dependencies/routes/routes.config";
import { enrollmentsRoutes } from "./modules/enrollments/routes/routes.config";
import { evaluationsRoutes } from "./modules/evaluations/routes/routes.config";
import { groupsRoutes } from "./modules/groups/routes/routes.config";
import { homeRoutes } from "./modules/home/routes/routes.config";
import { ratingsRoutes } from "./modules/ratings/routes/routes.config";
import { teachingRoutes } from "./modules/teaching/routes/routes.config";
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
	...checkInRoutes, // /asistencia/:token — el escaneo del QR se impone la sesión él mismo
	...certificateVerificationRoutes, // /verificar/:id — pública sin sesión, a propósito (ADR 0020)

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
					...coursesRoutes, // /dashboard/cursos  (alcance propio: incluye al capacitador interno)
					...contentRoutes, // /dashboard/cursos/:id/contenido  (temario del autogestivo)
					...certificatesRoutes, // /dashboard/cursos/:id/certificado (diseño), /dashboard/certificados/:id/descargar
					...enrollmentsRoutes, // /dashboard/cursos-disponibles, /dashboard/mis-cursos, /dashboard/cursos/:id/inscripciones
					...calendarRoutes, // /dashboard/calendario  (cualquier sesión: cada quien ve lo suyo)
					...teachingRoutes, // /dashboard/imparticion  (quien imparte u organiza)
					...evaluationsRoutes, // /dashboard/imparticion/:id/evaluaciones  (solo action)
					...creditsRoutes, // /dashboard/mis-creditos, /dashboard/creditos  (alcance por dependencia)
					...ratingsRoutes, // /dashboard/mis-cursos/:id/valorar  (solo action)
					...annualPlanRoutes, // /dashboard/plan-anual  (alcance por dependencia; el global consulta)
					...cloudAdminRoutes, // /dashboard/nube  (SUPERADMIN)
					...authAdminRoutes, // /dashboard/sesiones  (SUPERADMIN)
					...themeAdminRoutes, // /dashboard/personalizacion  (SUPERADMIN)
				]),
			]),
		],
	),

	// ══════════════════════════════════════════════════════════════════════════
	// Infraestructura — resource routes sin UI (auth mixta por prefijo)
	// ══════════════════════════════════════════════════════════════════════════
	...storageRoutes,
] satisfies RouteConfig;
