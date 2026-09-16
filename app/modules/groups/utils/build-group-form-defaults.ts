import type { Group } from "../domain/group.types";

export interface GroupFormValues {
	name: string;
	description: string;
}

/**
 * Valores iniciales del formulario.
 *
 * Ningún campo puede quedar `undefined`: react-hook-form nacería con inputs no
 * controlados y `isDirty` dejaría de ser fiable, que es lo que gobierna el aviso
 * de cambios sin guardar.
 */
export function buildGroupFormDefaults(group?: Group | null): GroupFormValues {
	return {
		name: group?.name ?? "",
		description: group?.description ?? "",
	};
}
