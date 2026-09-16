import type { UserType } from "@/modules/users/domain/user.rules";
import { Badge } from "@/shared/components/ui/badge";

/**
 * Estado del perfil. La copia no es "archivado": de cara a quien administra, un
 * perfil se desactiva — deja de aparecer en el catálogo y conserva lo impartido.
 */
export function TrainerStatusBadge({
	archivedAt,
}: {
	archivedAt: Date | string | null;
}) {
	return archivedAt ? (
		<Badge variant="destructive">Desactivado</Badge>
	) : (
		<Badge variant="outline">Activo</Badge>
	);
}

/** Interno o externo: decide qué campos tiene y qué puede hacer. */
export function TrainerTypeBadge({ type }: { type: UserType }) {
	return type === "EXTERNAL" ? (
		<Badge variant="secondary">Externo</Badge>
	) : (
		<Badge variant="outline">Interno</Badge>
	);
}
