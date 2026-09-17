import * as v from "valibot";
import { annualPlanRules } from "./annual-plan.rules";

export const validateFindPlan = (data: unknown) =>
	v.parse(annualPlanRules.find, data);
export const validateCreatePlan = (data: unknown) =>
	v.parse(annualPlanRules.create, data);
export const validateListPlans = (data: unknown) =>
	v.parse(annualPlanRules.list, data);
export const validatePlanLine = (data: unknown) =>
	v.parse(annualPlanRules.line, data);
