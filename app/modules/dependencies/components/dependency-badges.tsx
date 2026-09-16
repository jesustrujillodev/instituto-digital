import { Badge } from "@/shared/components/ui/badge";

/**
 * Distintivos de estado, compartidos por la tabla, la tarjeta móvil y el
 * detalle. Un solo sitio decide cómo se ve "Desactivada".
 *
 * La copia no es la de `users`: una dependencia no se "archiva" de cara a quien
 * la administra, se desactiva — deja de admitir personal pero sigue existiendo y
 * conservando su historial.
 */
export function DependencyStatusBadge({
	archivedAt,
}: {
	archivedAt: Date | string | null;
}) {
	return archivedAt ? (
		<Badge variant="destructive">Desactivada</Badge>
	) : (
		<Badge variant="outline">Activa</Badge>
	);
}

/** Marca a la cuenta que ocupa hoy la titularidad. */
export function HeadBadge({ isHead }: { isHead: boolean }) {
	return isHead ? <Badge variant="default">Titular</Badge> : null;
}
