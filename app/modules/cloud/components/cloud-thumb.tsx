import { File, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CloudRow } from "../utils/to-cloud-rows";

interface CloudThumbProps {
	row: CloudRow;
	/** `row` = cuadrado de fila de tabla; `tile` = ocupa la celda de la cuadrícula. */
	variant?: "row" | "tile";
	className?: string;
}

/**
 * Miniatura o icono de tipo. El icono no decora: es la única pista del tipo de
 * archivo cuando no hay imagen, así que va del mismo tamaño que la foto.
 */
export function CloudThumb({
	row,
	variant = "row",
	className,
}: CloudThumbProps) {
	const isTile = variant === "tile";
	const iconClass = cn("text-muted-foreground", isTile ? "size-10" : "size-5");

	let content: React.ReactNode;
	if (row.kind === "folder") {
		content = <Folder className={iconClass} aria-hidden="true" />;
	} else if (row.object.previewUrl) {
		content = (
			<img
				src={row.object.previewUrl}
				alt=""
				loading="lazy"
				decoding="async"
				className="size-full object-cover"
			/>
		);
	} else if (row.object.contentType === "application/pdf") {
		content = <FileText className={iconClass} aria-hidden="true" />;
	} else {
		content = <File className={iconClass} aria-hidden="true" />;
	}

	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center overflow-hidden bg-muted",
				isTile ? "aspect-square w-full" : "size-10 rounded-md",
				className,
			)}
		>
			{content}
		</div>
	);
}
