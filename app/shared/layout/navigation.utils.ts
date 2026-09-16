import { hasRole, type Role } from "@/shared/rules/atoms.rules";
import type { NavItem, NavSection } from "./navigation.types";

/** Lo que el filtro necesita saber de quien navega. */
export interface NavigationViewer {
	readonly role: Role;
	readonly isTrainer: boolean;
}

/**
 * ¿Le corresponde este item?
 *
 * Son dos condiciones que se SUMAN, no una cadena: un item marcado `trainer`
 * aparece para los roles que declara Y además para cualquier capacitador.
 */
const isVisible = (item: NavItem, viewer: NavigationViewer): boolean => {
	if (item.trainer && viewer.isTrainer) return true;

	return !item.roles || hasRole(viewer.role, item.roles);
};

/**
 * Filtra recursivamente la navegación por lo que alcanza quien navega.
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
	viewer: NavigationViewer,
): NavItem[] {
	const result: NavItem[] = [];

	for (const item of items) {
		if (!isVisible(item, viewer)) continue;

		if (!item.children) {
			result.push(item);
			continue;
		}

		const children = filterNavigationByRole(item.children, viewer);
		if (children.length === 0 && !item.path) continue;

		result.push({ ...item, children });
	}

	return result;
}

/**
 * Filtra las secciones por rol y descarta las que se quedan sin items, por la
 * misma razón que los grupos: una etiqueta sin destinos debajo no dice nada.
 */
export function filterNavigationSections(
	sections: readonly NavSection[],
	viewer: NavigationViewer,
): NavSection[] {
	return sections.flatMap((section) => {
		if (section.roles && !hasRole(viewer.role, section.roles)) return [];

		const items = filterNavigationByRole(section.items, viewer);
		return items.length > 0 ? [{ ...section, items }] : [];
	});
}
