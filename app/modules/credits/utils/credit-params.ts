/** Parámetros de la URL de las pantallas de créditos. */
export const CREDIT_PARAMS = {
	fiscalYear: "ejercicio",
	dependency: "dependencia",
} as const;

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
export const readPositiveInt = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** Los últimos ejercicios para el selector, incluido siempre el que se consulta. */
export const yearOptions = (selected: number, current: number, span = 5) => {
	const years = new Set<number>([selected]);
	for (let offset = 0; offset <= span; offset += 1) years.add(current - offset);
	return [...years].sort((a, b) => b - a);
};
