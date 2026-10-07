import * as v from "valibot";
import { creditRules } from "./credit.rules";

export const validateMyCreditsQuery = (data: unknown) =>
	v.parse(creditRules.mine, data);
export const validateCreditsOverviewQuery = (data: unknown) =>
	v.parse(creditRules.overview, data);

/** Lo que se acepta de vuelta de la caché del resumen por dependencia. */
export const dependencyCreditRowsSchema = v.array(
	v.object({
		dependencyDocumentId: v.string(),
		name: v.string(),
		credits: v.number(),
		people: v.number(),
	}),
);
