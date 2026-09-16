/**
 * Lee el campo que transporta los tokens del builder.
 *
 * Llega como JSON en un solo campo (ver `TOKENS_FIELD`): un `<input>` por token
 * serían más de setenta campos y el action tendría que recomponer el objeto
 * adivinando la forma a partir de los nombres.
 *
 * Un JSON roto devuelve `null` en vez de lanzar. El validador de frontera es
 * quien tiene que rechazarlo —con el mismo esquema y el mismo `code` que
 * cualquier otra entrada inválida—, no un `try` suelto en el adaptador.
 */
export const parseTokensField = (value: FormDataEntryValue | null): unknown => {
	if (typeof value !== "string") return null;

	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
};
