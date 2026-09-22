import * as v from "valibot";
import { contentRules } from "./content.rules";

export const validateFindContentCourse = (data: unknown) =>
	v.parse(contentRules.findCourse, data);
export const validateCreateModule = (data: unknown) =>
	v.parse(contentRules.createModule, data);
export const validateUpdateModule = (data: unknown) =>
	v.parse(contentRules.updateModule, data);
export const validateArchiveModule = (data: unknown) =>
	v.parse(contentRules.archiveModule, data);
export const validateCreateLesson = (data: unknown) =>
	v.parse(contentRules.createLesson, data);
export const validateUpdateLesson = (data: unknown) =>
	v.parse(contentRules.updateLesson, data);
export const validateArchiveLesson = (data: unknown) =>
	v.parse(contentRules.archiveLesson, data);
export const validateReorderContent = (data: unknown) =>
	v.parse(contentRules.reorder, data);
