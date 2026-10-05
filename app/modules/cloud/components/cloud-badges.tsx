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
 * Sin dueño, "Sin uso" es lo mismo que el escaneo daría por huérfano; uno
 * reciente puede ser de una edición que aún no se guarda.
 */
export function UsageCell({
	reference,
	orphan,
	compact = false,
}: {
	reference: ObjectReference | null;
	orphan: boolean;
	compact?: boolean;
}) {
	if (!reference) {
		return orphan ? (
			<Badge variant="outline" className="text-muted-foreground">
				Sin uso
			</Badge>
		) : (
			<Badge
				variant="outline"
				className="text-muted-foreground"
				title="Aún nadie lo usa: puede ser de algo que se está editando sin guardar."
			>
				Reciente
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
