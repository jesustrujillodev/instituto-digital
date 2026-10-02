export { loader } from "./fullscreen.layout.loader";

import { Outlet } from "react-router";
import { RouteErrorView } from "@/shared/components/errors/route-error-view";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { DashboardToaster } from "../components/dashboard-toaster";
import { NavigationProgress } from "../components/navigation-progress";
import type { Route } from "./+types/fullscreen.layout";

/**
 * Pantalla completa, sin barra lateral ni cabecera del dashboard. Lleva lo que
 * sus pantallas sí usan del shell: tooltips, toasts y la barra de navegación.
 */
export default function FullscreenLayout() {
	return (
		<TooltipProvider>
			<NavigationProgress />
			<Outlet />
			<DashboardToaster />
		</TooltipProvider>
	);
}

/** Sin shell que conservar: el error ocupa la pantalla. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	return (
		<main className="flex min-h-dvh items-center justify-center p-6">
			<RouteErrorView error={error} homeTo="/dashboard" />
		</main>
	);
}
