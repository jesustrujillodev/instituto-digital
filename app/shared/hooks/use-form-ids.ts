import { useId, useMemo } from "react";

/**
 * IDs únicos y estables (SSR-safe) para enlazar labels con controles.
 *
 * Resuelve tres problemas de los ids literales (`id="email"`): colisión cuando
 * el mismo formulario se monta dos veces, hydration mismatch si se generan al
 * azar, y el string duplicado entre el label y el input.
 *
 * La clave `form` se incluye siempre: es la que permite que el botón de guardar
 * viva FUERA del `<form>` (p. ej. en el PageHeader) usando `form={ids.form}`.
 *
 * `keys` debe ser una constante estable a nivel de módulo, no un literal inline:
 * el memo depende de su identidad, y un array nuevo en cada render devolvería un
 * objeto nuevo cada vez, anulando cualquier `memo()` aguas abajo.
 *
 * @example
 * const FIELD_KEYS = ["email", "role"] as const;
 * const ids = useFormIds(FIELD_KEYS);
 * // → { form: ":r3:form", email: ":r3:email", role: ":r3:role" }
 */
export function useFormIds<const K extends readonly string[]>(
	keys: K,
): Record<K[number] | "form", string> {
	const prefix = useId();

	return useMemo(
		() =>
			Object.fromEntries(
				["form", ...keys].map((key) => [key, `${prefix}${key}`]),
			) as Record<K[number] | "form", string>,
		[prefix, keys],
	);
}
