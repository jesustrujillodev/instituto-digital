import type { Dependency } from "../domain/dependency.types";

export interface DependencyFormValues {
	name: string;
	acronym: string;
}

/**
 * Valores iniciales del formulario.
 *
 * Ningún campo puede quedar `undefined`: react-hook-form nacería con inputs no
 * controlados y `isDirty` dejaría de ser fiable, que es lo que gobierna el aviso
 * de cambios sin guardar.
 */
export function buildDependencyFormDefaults(
	dependency?: Dependency | null,
): DependencyFormValues {
	return {
		name: dependency?.name ?? "",
		// La columna admite null; el input, no. "" es la representación de "sin
		// siglas" en el formulario, y `parseDependencyFormData` la vuelve a
		// convertir en ausencia al enviarla.
		acronym: dependency?.acronym ?? "",
	};
}
