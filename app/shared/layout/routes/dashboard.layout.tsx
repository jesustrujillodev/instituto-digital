export { loader } from "./dashboard.layout.loader";

import type { CSSProperties } from "react";
import { Outlet, useLoaderData } from "react-router";
import { Toaster } from "sileo";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { useThemeMode } from "@/modules/theme/hooks/use-theme-mode";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/shared/components/ui/sidebar";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { DashboardBreadcrumb } from "../components/dashboard-breadcrumb";
import { DashboardSidebar } from "../components/dashboard-sidebar";
import { DashboardUserMenu } from "../components/dashboard-user-menu";

export default function DashboardLayout() {
	const {
		data: { user, securityState },
	} = useLoaderData<typeof import("./dashboard.layout.loader").loader>();
	const { mode } = useThemeMode();

	// TooltipProvider es necesario aquí: SidebarProvider NO lo incluye, y
	// SidebarMenuButton monta un Tooltip cuando la barra está colapsada a iconos.
	// Se limita al dashboard en vez de ponerse global en root.tsx.
	//
	// El Toaster sigue el mismo criterio de alcance: hoy solo las pantallas del
	// dashboard emiten toasts. Si una ruta pública llegara a necesitarlos, sube
	// a root.tsx.
	return (
		<TooltipProvider>
			{/* 19rem es el ancho que fija el bloque sidebar-04; el defecto son 16rem. */}
			<SidebarProvider style={{ "--sidebar-width": "19rem" } as CSSProperties}>
				<DashboardSidebar user={user} />
				{/* `min-w-0`: sin él, este hijo flex crece hasta el ancho mínimo de su
				    contenido y una tabla ancha empuja toda la página en horizontal en
				    vez de desplazarse dentro de su propio `overflow-x-auto`. */}
				<SidebarInset className="min-w-0">
					<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
						<SidebarTrigger className="-ml-1" />
						<DashboardBreadcrumb />
						{/* `ml-auto` y no depender del `flex-1` del breadcrumb: en
						    /dashboard no hay rastro y el grupo se quedaría pegado al
						    trigger. */}
						<div className="ml-auto flex shrink-0 items-center gap-1">
							<ThemeModeToggle />
							<DashboardUserMenu user={user} />
						</div>
					</header>
					{securityState?.lockdownAt && (
						// Solo lo ven los roles exentos: los demás ni siquiera llegan a
						// pintar este layout (requireAuth ya los cortó antes).
						<div className="w-full border-destructive/50 border-b bg-destructive/10 px-4 py-2 text-center font-medium text-destructive text-sm">
							Lockdown activo (alcance: {securityState.lockdownScope}) desde{" "}
							{new Date(securityState.lockdownAt).toLocaleString("es-MX")}
						</div>
					)}
					<div className="flex flex-1 flex-col gap-4 p-4">
						<div className="container mx-auto">
							<Outlet />
						</div>
					</div>
				</SidebarInset>
				{/*
				 * Sileo no lee la clase `dark` de <html>: necesita el modo para elegir
				 * el relleno de la píldora, que va invertido a propósito (oscura en
				 * claro, clara en oscuro). `mode` ya es el resuelto por el servidor y
				 * Sileo entiende los mismos tres valores. Los colores de estado salen
				 * de los tokens del tema: ver el bloque de Sileo en app.css.
				 */}
				<Toaster theme={mode} position="top-center" />
			</SidebarProvider>
		</TooltipProvider>
	);
}
