import type { UIMatch } from "react-router";
import type { BreadcrumbItem } from "@/shared/components/common/breadcrumb";
import type { BreadcrumbHandle } from "./breadcrumb.types";

function hasBreadcrumb(handle: unknown): handle is BreadcrumbHandle {
	return (
		typeof handle === "object" &&
		handle !== null &&
		"breadcrumb" in handle &&
		typeof handle.breadcrumb === "function"
	);
}

/**
 * Rastro de la ruta activa: el del match más profundo que declare
 * `handle.breadcrumb`.
 *
 * Gana el más profundo —y no se concatenan— porque las rutas del dashboard son
 * planas y cada hoja ya declara el rastro completo. Sin ningún handle devuelve
 * `[]`, que es lo que deja `/dashboard` sin breadcrumb.
 *
 * Pura: recibe los matches en vez de llamar a `useMatches()`, así que se puede
 * testear con matches sintéticos.
 */
export function resolveBreadcrumb(
	matches: readonly UIMatch[],
): BreadcrumbItem[] {
	for (let index = matches.length - 1; index >= 0; index--) {
		const { handle, loaderData } = matches[index];
		if (hasBreadcrumb(handle)) return handle.breadcrumb(loaderData);
	}

	return [];
}
