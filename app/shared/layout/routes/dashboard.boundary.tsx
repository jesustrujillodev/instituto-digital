import { Outlet } from "react-router";
import { RouteErrorView } from "@/shared/components/errors/route-error-view";
import type { Route } from "./+types/dashboard.boundary";

/**
 * Ruta pasarela sin path: existe SOLO para alojar el ErrorBoundary de
 * /dashboard/*.
 *
 * React Router renderiza el errorElement EN LUGAR del elemento de la ruta que lo
 * declara (`_renderMatches` corta la lista de matches en `errorIndex`). Si el
 * boundary viviera en dashboard.layout.tsx, un error de una ruta hija borraría
 * el shell entero — barra lateral incluida. Al vivir un nivel más abajo, el
 * error se pinta dentro del <Outlet/> del shell y la navegación sobrevive.
 *
 * No la borres por parecer un wrapper inútil: quitarla cambia el comportamiento.
 */
export default function DashboardBoundaryPassthrough() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	return <RouteErrorView error={error} homeTo="/dashboard" />;
}
