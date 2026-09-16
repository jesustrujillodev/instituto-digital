import { Badge } from "@/shared/components/ui/badge";
import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Distintivos de rol y estado, compartidos por la tabla, la tarjeta móvil, el
 * detalle y el perfil. Un solo sitio decide cómo se ve "Titular" o "Archivado".
 *
 * Los diccionarios están tipados `Record<Role, string>` y no `Record<string,
 * string>`: así añadir un rol a la tupla rompe en compilación aquí en vez de
 * pintar su identificador crudo en pantalla, que es lo que pasaba antes.
 */
export const ROLE_LABELS: Record<Role, string> = {
	SUPERADMIN: "Superadministrador",
	DEPENDENCY_HEAD: "Titular",
	DEPENDENCY_DEPUTY: "Auxiliar",
	USER: "Participante",
	ADMIN: "Administrador",
};

/**
 * La misma copia en plural, para el `Select` de filtro del listado.
 *
 * Vive junto a la singular y no suelta en la pantalla: antes eran dos
 * diccionarios con el MISMO nombre, uno local y no exportado, y ninguno de los
 * dos fallaba al añadir un rol.
 */
export const ROLE_FILTER_LABELS: Record<Role, string> = {
	SUPERADMIN: "Superadministradores",
	DEPENDENCY_HEAD: "Titulares",
	DEPENDENCY_DEPUTY: "Auxiliares",
	USER: "Participantes",
	ADMIN: "Administradores",
};

/** Los roles de plataforma se destacan; los de dependencia y el base, no. */
const ROLE_VARIANTS: Record<Role, "default" | "secondary"> = {
	SUPERADMIN: "default",
	ADMIN: "default",
	DEPENDENCY_HEAD: "secondary",
	DEPENDENCY_DEPUTY: "secondary",
	USER: "secondary",
};

export function RoleBadge({ role }: { role: Role }) {
	return <Badge variant={ROLE_VARIANTS[role]}>{ROLE_LABELS[role]}</Badge>;
}

export function StatusBadge({
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

/** Interno (personal del Ayuntamiento) o externo (capacitador de fuera). */
export function UserTypeBadge({ type }: { type: "INTERNAL" | "EXTERNAL" }) {
	return (
		<Badge variant="outline">
			{type === "INTERNAL" ? "Interno" : "Externo"}
		</Badge>
	);
}

/**
 * Perfil de capacitador activo.
 *
 * Se suma al rol en vez de sustituirlo: §3 del alcance exige que los roles se
 * acumulen —alguien es auxiliar y capacitador a la vez— y por eso el perfil no
 * entra en la tupla `ROLES`.
 */
export function TrainerBadge({ isTrainer }: { isTrainer: boolean }) {
	return isTrainer ? <Badge variant="secondary">Capacitador</Badge> : null;
}
