import * as v from "valibot";
import { teachingRules } from "./teaching.rules";

export const validateFindTeachingCourse = (data: unknown) =>
	v.parse(teachingRules.find, data);
export const validateListTeachingCourses = (data: unknown) =>
	v.parse(teachingRules.list, data);
export const validateSaveAttendance = (data: unknown) =>
	v.parse(teachingRules.attendance, data);
export const validateSaveResults = (data: unknown) =>
	v.parse(teachingRules.results, data);
