import * as v from "valibot";
import { COURSE_MODALITIES } from "@/modules/courses/domain/course.rules";
import { CALENDAR_VIEWS } from "./calendar.config";

const documentId = v.pipe(v.string(), v.uuid());

/** La forma `YYYY-MM`; el rango lo decide `parseMonth`. */
export const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export const calendarQueryRule = v.object({
	month: v.optional(v.pipe(v.string(), v.regex(MONTH_PATTERN))),
	view: v.optional(v.picklist(CALENDAR_VIEWS), "month"),
	dependency: v.optional(documentId),
	modality: v.optional(v.picklist(COURSE_MODALITIES)),
	trainer: v.optional(documentId),
	staff: v.optional(v.boolean(), false),
});

export const validateCalendarQuery = (data: unknown) =>
	v.parse(calendarQueryRule, data);
