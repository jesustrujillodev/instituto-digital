import * as v from "valibot";
import { userRules } from "./user.rules";

// Cada función valida y lanza ValiError si falla
// El action/loader decide cómo manejar el error

export const validateCreateUser = (data: unknown) =>
	v.parse(userRules.create, data);
export const validateUpdateUser = (data: unknown) =>
	v.parse(userRules.update, data);
export const validateChangePassword = (data: unknown) =>
	v.parse(userRules.changePassword, data);
export const validateAdminResetPassword = (data: unknown) =>
	v.parse(userRules.adminResetPassword, data);
export const validateFindUser = (data: unknown) =>
	v.parse(userRules.find, data);
export const validateListUsers = (data: unknown) =>
	v.parse(userRules.list, data);
export const validateDeleteUser = (data: unknown) =>
	v.parse(userRules.delete, data);
export const validateChangeOwnDependency = (data: unknown) =>
	v.parse(userRules.changeOwnDependency, data);
