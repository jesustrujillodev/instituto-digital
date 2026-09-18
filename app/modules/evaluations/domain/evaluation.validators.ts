import * as v from "valibot";
import { evaluationRules } from "./evaluation.rules";

export const validateFindEvaluationCourse = (data: unknown) =>
	v.parse(evaluationRules.findCourse, data);
export const validateCreateEvaluation = (data: unknown) =>
	v.parse(evaluationRules.create, data);
export const validateUpdateEvaluation = (data: unknown) =>
	v.parse(evaluationRules.update, data);
export const validateRemoveEvaluation = (data: unknown) =>
	v.parse(evaluationRules.remove, data);
export const validateSaveEvaluationResults = (data: unknown) =>
	v.parse(evaluationRules.results, data);
