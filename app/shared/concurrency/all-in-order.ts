/**
 * `Promise.all` cuyo error es el de la primera posición que falló, no el del
 * primero en fallar en el tiempo. Es lo que permite lanzar a la vez lecturas
 * que antes iban en fila sin cambiar qué error gana: el de la que iba antes.
 */
export const allInOrder = async <const T extends readonly unknown[]>(
	promises: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> => {
	const settled = await Promise.allSettled(promises);
	for (const result of settled) {
		if (result.status === "rejected") throw result.reason;
	}
	return settled.map(
		(result) => (result as PromiseFulfilledResult<unknown>).value,
	) as { -readonly [K in keyof T]: Awaited<T[K]> };
};
