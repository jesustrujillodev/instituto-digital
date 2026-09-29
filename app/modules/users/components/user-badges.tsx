import { ROLE_LABELS } from "@/shared/auth/role-labels";
import { Badge } from "@/shared/components/ui/badge";
import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Distintivos de rol y estado, compartidos por la tabla, la tarjeta móvil, el
 * detalle y el perfil. Un solo sitio decide cómo se ve "Titular" o "Archivado".
 *
 * La copia singular vive en `shared/auth/role-labels.ts` porque también la
 * pintan el menú de la cuenta y el 403, que no pueden importar de un módulo.
 */

/**
 * La copia en plural, para el `Select` de filtro del listado. Tipada
 * `Record<Role, string>` por lo mismo que la singular.
 */
export const ROLE_FILTER_LABELS: Record<Role, string> = {
	SUPERADMIN: "Superadministradores",
	DEPENDENCY_HEAD: "Titulares",
	DEPENDENCY_DEPUTY: "Auxiliares",
	USER: "Participantes",
};

/** El rol de plataforma se destaca; los de dependencia y el base, no. */
const ROLE_VARIANTS: Record<Role, "default" | "secondary"> = {
	SUPERADMIN: "default",
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
 * Rol de un interno, o "Externo" para quien viene de fuera.
 *
 * Un externo lleva `USER` en la base, pero no es participante: no cursa ni
 * pertenece a una dependencia. Pintar su rol diría algo falso de él.
 */
export function AccountRoleBadge({
	role,
	type,
}: {
	role: Role;
	type: "INTERNAL" | "EXTERNAL";
}) {
	return type === "EXTERNAL" ? (
		<UserTypeBadge type={type} />
	) : (
		<RoleBadge role={role} />
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
