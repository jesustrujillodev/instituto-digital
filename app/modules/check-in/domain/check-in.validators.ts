import * as v from "valibot";
import { checkInRules } from "./check-in.rules";

export const validateCheckInToken = (data: unknown) =>
	v.parse(checkInRules.token, data);
export const validateRotateQrToken = (data: unknown) =>
	v.parse(checkInRules.rotate, data);
