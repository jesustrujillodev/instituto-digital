import * as v from "valibot";
import { classroomRules } from "./classroom.rules";
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
export const validateFindMaterial = (data: unknown) =>
	v.parse(contentRules.findMaterial, data);
export const validateUploadUrl = (data: unknown) =>
	v.parse(contentRules.uploadUrl, data);
export const validateSaveMaterial = (data: unknown) =>
	v.parse(contentRules.saveMaterial, data);
export const validateFindClassroom = (data: unknown) =>
	v.parse(classroomRules.find, data);
export const validateFindClassroomLesson = (data: unknown) =>
	v.parse(classroomRules.findLesson, data);
export const validateRecordProgress = (data: unknown) =>
	v.parse(classroomRules.record, data);
