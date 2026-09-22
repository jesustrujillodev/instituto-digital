import * as v from "valibot";
import { createListRule } from "@/shared/rules/list.rules";
import { CREDIT_YEAR_RANGE } from "./credit.config";
import type { CreditCandidate, CreditDiff, StoredCredit } from "./credit.types";

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

const fiscalYear = v.pipe(
	v.number("El ejercicio fiscal debe ser un número."),
	v.integer("El ejercicio fiscal debe ser un año entero."),
	v.minValue(
		CREDIT_YEAR_RANGE.min,
		`El ejercicio fiscal no puede ser anterior a ${CREDIT_YEAR_RANGE.min}.`,
	),
	v.maxValue(
		CREDIT_YEAR_RANGE.max,
		`El ejercicio fiscal no puede ser posterior a ${CREDIT_YEAR_RANGE.max}.`,
	),
);

export const myCreditsQueryRule = v.object({
	fiscalYear: v.optional(fiscalYear),
});

export const creditsOverviewQueryRule = createListRule({
	fiscalYear: v.optional(fiscalYear),
	/** Solo lo lee el alcance global: pedir otra dependencia no amplía nada. */
	dependency: v.optional(documentId),
});

export const creditRules = {
	mine: myCreditsQueryRule,
	overview: creditsOverviewQueryRule,
} as const;

/**
 * Qué cambia en los créditos de un curso para que coincidan con quién completó.
 *
 * Es la misma función al finalizar y al corregir. Un crédito retirado se
 * restaura en lugar de crearse de nuevo: la fila es única por persona y curso y
 * conserva la dependencia con la que se obtuvo la primera vez.
 */
export const diffCredits = (
	existing: readonly StoredCredit[],
	completed: readonly CreditCandidate[],
): CreditDiff => {
	const byUser = new Map(existing.map((credit) => [credit.userId, credit]));
	const completedIds = new Set(completed.map((candidate) => candidate.userId));

	const grant: CreditCandidate[] = [];
	const restore: number[] = [];

	for (const candidate of completed) {
		const current = byUser.get(candidate.userId);
		if (!current) grant.push(candidate);
		else if (current.revokedAt !== null) restore.push(candidate.userId);
	}

	const revoke = existing
		.filter(
			(credit) => credit.revokedAt === null && !completedIds.has(credit.userId),
		)
		.map((credit) => credit.userId);

	return { grant, restore, revoke };
};
