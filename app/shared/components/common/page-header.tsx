import { ArrowLeftIcon, MoreVerticalIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

interface PageHeaderProps {
	title: string | React.ReactNode;
	titleAccent?: string;
	description?: string | React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
	titleClassName?: string;
	descriptionClassName?: string;
	actionsClassName?: string;
	goBack?: string;
	/**
	 * En móvil, agrupa las acciones en un menú de tres puntos junto al título en
	 * vez de apilarlas a todo el ancho. Pensado para pantallas que repiten sus
	 * acciones en otro lugar (el pie de un formulario largo): el encabezado es
	 * fijo y cada botón apilado le resta alto útil a la pantalla.
	 */
	collapseActionsOnMobile?: boolean;
}

export function PageHeader({
	title,
	titleAccent,
	description,
	actions,
	className,
	titleClassName,
	descriptionClassName,
	actionsClassName,
	goBack = undefined,
	collapseActionsOnMobile = false,
}: PageHeaderProps) {
	const [menuOpen, setMenuOpen] = useState(false);

	// El menú se cierra en la TAREA siguiente al clic: si el botón se desmontara
	// dentro del mismo evento, el navegador ya no enviaría el <form> al que apunta
	// con su atributo `form`.
	const closeMenuAfterAction = (event: React.MouseEvent) => {
		if ((event.target as Element).closest("button, a")) {
			setTimeout(() => setMenuOpen(false));
		}
	};

	return (
		<div
			className={cn(
				// Sin `backdrop-blur`: `bg-background` es opaco, así que no había nada que
				// desenfocar detrás y solo quedaba el coste de componer la capa al hacer
				// scroll, que es cuando esta cabecera está fija y encima del contenido.
				"flex flex-col md:flex-row items-stretch md:items-center sticky top-0 bg-background z-10 justify-between gap-4 py-4",
				collapseActionsOnMobile && "flex-row items-center",
				className,
			)}
		>
			<div className="flex items-center gap-4 min-w-0 flex-1">
				{goBack && (
					<Button variant="ghost" size="icon" asChild>
						{/* El icono es decorativo: sin este texto el enlace se anuncia
						    como "enlace" a secas (WCAG 4.1.2). */}
						<Link to={goBack}>
							<ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
							<span className="sr-only">Volver</span>
						</Link>
					</Button>
				)}
				<div className="flex flex-col gap-1 min-w-0 flex-1">
					<h1
						className={cn(
							"text-xl md:text-3xl font-bold wrap-break-word",
							titleClassName,
						)}
					>
						{title}
						{titleAccent && (
							// `accent` es una SUPERFICIE (0,97 de luminosidad en claro): como
							// color de texto dejaba el nombre en ≈1,1:1, invisible en los dos
							// modos. El token de texto secundario es el que existe para esto.
							<span className="text-muted-foreground font-medium ml-2">
								- {titleAccent}
							</span>
						)}
					</h1>
					{description && (
						<p
							className={cn(
								"text-muted-foreground text-sm md:text-base",
								descriptionClassName,
							)}
						>
							{description}
						</p>
					)}
				</div>
			</div>
			{actions && collapseActionsOnMobile && (
				<Popover open={menuOpen} onOpenChange={setMenuOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							className="shrink-0 md:hidden"
						>
							<MoreVerticalIcon className="w-5 h-5" aria-hidden="true" />
							<span className="sr-only">Acciones</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-56 gap-2 p-2 *:w-full"
						onClick={closeMenuAfterAction}
					>
						{actions}
					</PopoverContent>
				</Popover>
			)}
			{actions && (
				<div
					className={cn(
						"shrink-0 w-full md:w-auto flex flex-col md:flex-row gap-2 transition-all duration-300 ease-in-out *:w-full md:*:w-auto",
						collapseActionsOnMobile && "hidden md:flex",
						actionsClassName,
					)}
				>
					{actions}
				</div>
			)}
		</div>
	);
}
