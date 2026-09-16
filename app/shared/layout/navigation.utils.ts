import { hasRole, type Role } from "@/shared/rules/atoms.rules";
import type { NavItem } from "./navigation.types";

/**
 * Filtra recursivamente la navegación por rol.
 *
 * Un grupo contenedor (sin `path` propio) que se queda sin hijos visibles
 * desaparece entero: si no, quedarían encabezados huérfanos sugiriendo
 * funcionalidad inaccesible.
 *
 * Puro e independiente de `navigation.config`: solo importa el tipo, así que se
 * puede testear aislado con items sintéticos.
 */
export function filterNavigationByRole(
	items: readonly NavItem[],
	role: Role,
): NavItem[] {
	const result: NavItem[] = [];

	for (const item of items) {
		if (item.roles && !hasRole(role, item.roles)) continue;

		if (!item.children) {
			result.push(item);
			continue;
		}

		const children = filterNavigationByRole(item.children, role);
		if (children.length === 0 && !item.path) continue;

		result.push({ ...item, children });
	}

	return result;
}
