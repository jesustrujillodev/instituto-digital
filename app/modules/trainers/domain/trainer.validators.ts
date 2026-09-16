import * as v from "valibot";
import { trainerRules } from "./trainer.rules";

// Cada función valida y lanza ValiError si falla.
// El action/loader decide cómo manejar el error.

export const validateActivateProfile = (data: unknown) =>
	v.parse(trainerRules.activate, data);
export const validateUpdateProfile = (data: unknown) =>
	v.parse(trainerRules.update, data);
export const validateCreateExternalTrainer = (data: unknown) =>
	v.parse(trainerRules.createExternal, data);
export const validateFindTrainer = (data: unknown) =>
	v.parse(trainerRules.find, data);
export const validateListTrainers = (data: unknown) =>
	v.parse(trainerRules.list, data);
