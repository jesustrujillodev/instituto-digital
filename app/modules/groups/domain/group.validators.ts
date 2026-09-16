import * as v from "valibot";
import { groupRules } from "./group.rules";

// Cada función valida y lanza ValiError si falla.
// El action/loader decide cómo manejar el error.

export const validateCreateGroup = (data: unknown) =>
	v.parse(groupRules.create, data);
export const validateUpdateGroup = (data: unknown) =>
	v.parse(groupRules.update, data);
export const validateFindGroup = (data: unknown) =>
	v.parse(groupRules.find, data);
export const validateListGroups = (data: unknown) =>
	v.parse(groupRules.list, data);
export const validateAddMembers = (data: unknown) =>
	v.parse(groupRules.addMembers, data);
export const validateRemoveMember = (data: unknown) =>
	v.parse(groupRules.removeMember, data);
export const validateListCandidates = (data: unknown) =>
	v.parse(groupRules.listCandidates, data);
