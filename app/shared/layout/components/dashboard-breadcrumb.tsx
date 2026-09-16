import { useMatches } from "react-router";
import { Breadcrumb } from "@/shared/components/common/breadcrumb";
import { Separator } from "@/shared/components/ui/separator";
import { resolveBreadcrumb } from "../breadcrumb.utils";

/**
 * Rastro de la ruta activa, pintado en el header del dashboard.
 *
 * Cada ruta lo declara en `export const handle` (ver `BreadcrumbHandle`); aquí
 * solo se lee. Sin rastro no se pinta nada —ni siquiera el separador—, para que
 * en /dashboard no quede una raya suelta junto al trigger.
 */
export function DashboardBreadcrumb() {
	const items = resolveBreadcrumb(useMatches());

	if (items.length === 0) return null;

	return (
		<>
			{/* El separador trae `self-stretch`: sin acotarlo ocuparía todo el alto
			    del header. */}
			<Separator
				orientation="vertical"
				className="mr-2 data-vertical:h-4 data-vertical:self-auto"
			/>
			<Breadcrumb items={items} className="min-w-0 flex-1" />
		</>
	);
}
