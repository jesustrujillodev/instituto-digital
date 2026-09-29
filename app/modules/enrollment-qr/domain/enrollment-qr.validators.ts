import * as v from "valibot";
import { enrollmentQrRules } from "./enrollment-qr.rules";

export const validateEnrollmentQrToken = (data: unknown) =>
	v.parse(enrollmentQrRules.token, data);
export const validateEnrollmentQrCourse = (data: unknown) =>
	v.parse(enrollmentQrRules.course, data);
