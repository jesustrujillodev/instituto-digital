import { ChevronRight, LayoutGrid, List } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import type { CloudCrumb } from "../domain/cloud.types";
import type { CloudViewMode } from "../hooks/use-view-mode";
import { crumbLabel, folderHref } from "../utils/to-cloud-rows";

interface CloudPathBarProps {
	trail: CloudCrumb[];
	viewMode: CloudViewMode;
	onViewModeChange: (mode: CloudViewMode) => void;
}

/**
 * Dónde estoy y cómo lo veo. Las migas usan el nombre legible de cada carpeta
 * ("Fotos de vehículos / Ana Ruiz") y la ruta cruda queda en el
 * `title`, que es lo que busca quien viene de la consola del proveedor.
 */
export function CloudPathBar({
	trail,
	viewMode,
	onViewModeChange,
}: CloudPathBarProps) {
	const atRoot = trail.length === 0;

	return (
		<div className="flex items-center justify-between gap-3 pb-4">
			<nav aria-label="Carpeta actual" className="min-w-0 flex-1">
				<ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
					<li className="flex items-center">
						{atRoot ? (
							<span aria-current="page" className="font-medium text-foreground">
								Todo el almacenamiento
							</span>
						) : (
							<Link
								to={folderHref("")}
								className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
							>
								Todo el almacenamiento
							</Link>
						)}
					</li>
					{trail.map((crumb, index) => {
						const isLast = index === trail.length - 1;

						return (
							<li
								key={crumb.prefix}
								className="flex min-w-0 items-center gap-1"
							>
								<ChevronRight
									className="size-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								{isLast ? (
									<span
										aria-current="page"
										title={crumb.prefix}
										className="truncate font-medium text-foreground"
									>
										{crumbLabel(crumb)}
									</span>
								) : (
									<Link
										to={folderHref(crumb.prefix)}
										title={crumb.prefix}
										className="truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
									>
										{crumbLabel(crumb)}
									</Link>
								)}
							</li>
						);
					})}
				</ol>
			</nav>

			<fieldset className="flex shrink-0 items-center gap-0.5 rounded-4xl bg-muted p-0.5">
				<legend className="sr-only">Vista</legend>
				{(
					[
						{ mode: "list", label: "Lista", Icon: List },
						{ mode: "grid", label: "Cuadrícula", Icon: LayoutGrid },
					] as const
				).map(({ mode, label, Icon }) => {
					const active = viewMode === mode;

					return (
						<Button
							key={mode}
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-pressed={active}
							title={label}
							onClick={() => onViewModeChange(mode)}
							className={cn(
								"text-muted-foreground",
								active &&
									"bg-background text-foreground shadow-xs hover:bg-background",
							)}
						>
							<Icon aria-hidden="true" />
							<span className="sr-only">{label}</span>
						</Button>
					);
				})}
			</fieldset>
		</div>
	);
}
