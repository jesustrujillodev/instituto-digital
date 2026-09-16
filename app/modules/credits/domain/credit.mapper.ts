import type { MyCredit, MyCredits } from "./credit.types";

/** Total del ejercicio, acumulado histórico y ejercicios disponibles (§6.9). */
export const summarizeMine = (
	credits: readonly MyCredit[],
	fiscalYear: number,
): MyCredits => {
	const years = new Set(credits.map((credit) => credit.fiscalYear));
	years.add(fiscalYear);

	return {
		fiscalYear,
		yearTotal: credits.filter((credit) => credit.fiscalYear === fiscalYear)
			.length,
		historicTotal: credits.length,
		years: [...years].sort((a, b) => b - a),
		credits: [...credits],
	};
};
