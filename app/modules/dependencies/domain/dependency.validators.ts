import * as v from "valibot";
import { dependencyRules } from "./dependency.rules";

// Cada función valida y lanza ValiError si falla
// El action/loader decide cómo manejar el error

export const validateCreateDependency = (data: unknown) =>
	v.parse(dependencyRules.create, data);
export const validateUpdateDependency = (data: unknown) =>
	v.parse(dependencyRules.update, data);
export const validateFindDependency = (data: unknown) =>
	v.parse(dependencyRules.find, data);
export const validateListDependencies = (data: unknown) =>
	v.parse(dependencyRules.list, data);
export const validateAssignHead = (data: unknown) =>
	v.parse(dependencyRules.assignHead, data);
