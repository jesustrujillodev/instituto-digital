import { Badge } from "@/shared/components/ui/badge";

/** Estado del grupo. Archivarlo libera su nombre dentro de la dependencia. */
export function GroupStatusBadge({
	archivedAt,
}: {
	archivedAt: Date | string | null;
}) {
	return archivedAt ? (
		<Badge variant="destructive">Archivado</Badge>
	) : (
		<Badge variant="outline">Activo</Badge>
	);
}

/** Cuánta gente tiene dentro, que es lo que hace útil a una lista nominal. */
export function MemberCountBadge({ count }: { count: number }) {
	return (
		<Badge variant="secondary">
			{count === 1 ? "1 miembro" : `${count} miembros`}
		</Badge>
	);
}
