import * as v from "valibot";
import { creditRules } from "./credit.rules";

export const validateMyCreditsQuery = (data: unknown) =>
	v.parse(creditRules.mine, data);
export const validateCreditsOverviewQuery = (data: unknown) =>
	v.parse(creditRules.overview, data);
