import * as v from "valibot";
import { COURSE_MODALITIES } from "@/modules/courses/domain/course.rules";
import { CALENDAR_VIEWS } from "./calendar.config";

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

/** La forma `YYYY-MM`; el rango lo decide `parseMonth`. */
export const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export const calendarQueryRule = v.object({
	month: v.optional(
		v.pipe(
			v.string("El mes debe ser texto."),
			v.regex(MONTH_PATTERN, "Escribe el mes con el formato AAAA-MM."),
		),
	),
	view: v.optional(
		v.picklist(CALENDAR_VIEWS, "La vista del calendario no es válida."),
		"month",
	),
	dependency: v.optional(documentId),
	modality: v.optional(
		v.picklist(COURSE_MODALITIES, "Elige una modalidad válida."),
	),
	trainer: v.optional(documentId),
	staff: v.optional(v.boolean("El filtro de personal no es válido."), false),
});

export const validateCalendarQuery = (data: unknown) =>
	v.parse(calendarQueryRule, data);
