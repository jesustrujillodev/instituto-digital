import * as v from "valibot";
import { courseRules } from "./course.rules";

// Cada función valida y lanza ValiError si falla.
// El action/loader decide cómo manejar el error.

export const validateCreateCourse = (data: unknown) =>
	v.parse(courseRules.create, data);
export const validateUpdateCourse = (data: unknown) =>
	v.parse(courseRules.update, data);
export const validateFindCourse = (data: unknown) =>
	v.parse(courseRules.find, data);
export const validateListCourses = (data: unknown) =>
	v.parse(courseRules.list, data);
export const validateCourseSession = (data: unknown) =>
	v.parse(courseRules.session, data);
