import * as v from "valibot";
import { enrollmentRules } from "./enrollment.rules";

export const validateFindEnrollmentCourse = (data: unknown) =>
	v.parse(enrollmentRules.findCourse, data);
export const validateListAvailableCourses = (data: unknown) =>
	v.parse(enrollmentRules.listAvailable, data);
export const validateSearchParticipants = (data: unknown) =>
	v.parse(enrollmentRules.searchParticipants, data);
export const validateAssignParticipants = (data: unknown) =>
	v.parse(enrollmentRules.assign, data);
export const validateInviteParticipants = (data: unknown) =>
	v.parse(enrollmentRules.invite, data);
