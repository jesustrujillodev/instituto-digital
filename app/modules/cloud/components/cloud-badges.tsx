import { Globe, Lock } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/shared/components/ui/badge";
import type { ObjectReference } from "@/shared/storage/object-reference.port";
import type { CloudVisibility } from "../domain/cloud.types";

/**
 * Quién puede abrir el archivo. Público = se sirve sin sesión (y el catálogo por
 * CDN); privado = exige sesión. El icono repite el texto a propósito: en la
 * cuadrícula solo cabe el icono.
 */
export function VisibilityBadge({
	visibility,
}: {
	visibility: CloudVisibility;
}) {
	return visibility === "public" ? (
		<Badge variant="outline">
			<Globe aria-hidden="true" />
			Público
		</Badge>
	) : (
		<Badge variant="secondary">
			<Lock aria-hidden="true" />
			Privado
		</Badge>
	);
}

/**
 * A quién pertenece el archivo, con enlace a su pantalla.
 *
 * "Sin uso" y no "Huérfano": el listado no aplica la ventana de gracia, así que
 * una foto que se está guardando ahora mismo sale aquí sin dueño todavía. El
 * veredicto de huérfano lo da el escaneo.
 */
export function UsageCell({
	reference,
	compact = false,
}: {
	reference: ObjectReference | null;
	compact?: boolean;
}) {
	if (!reference) {
		return (
			<Badge variant="outline" className="text-muted-foreground">
				Sin uso
			</Badge>
		);
	}

	const label = (
		<>
			<span className="truncate font-medium">{reference.label}</span>
			{reference.detail && !compact && (
				<span className="truncate text-muted-foreground text-xs">
					{reference.detail}
				</span>
			)}
		</>
	);

	return reference.href ? (
		<Link
			to={reference.href}
			onClick={(event) => event.stopPropagation()}
			className="flex min-w-0 flex-col text-sm underline-offset-4 hover:underline focus-visible:underline"
		>
			{label}
		</Link>
	) : (
		<span className="flex min-w-0 flex-col text-sm">{label}</span>
	);
}
