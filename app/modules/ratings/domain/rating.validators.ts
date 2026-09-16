import * as v from "valibot";
import { ratingRules } from "./rating.rules";

export const validateFindRatingCourse = (data: unknown) =>
	v.parse(ratingRules.find, data);
export const validateRateCourse = (data: unknown) =>
	v.parse(ratingRules.rate, data);
