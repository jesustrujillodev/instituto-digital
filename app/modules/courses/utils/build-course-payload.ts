import * as v from "valibot";
import { createCourseRule, updateCourseRule } from "../domain/course.rules";
import type { CreateCourseDto, UpdateCourseDto } from "../domain/course.types";
import type { CourseFormValues } from "./build-course-form-defaults";

/** Texto vacío es "no capturado", no una cadena que validar. */
const optionalText = (value: string): string | undefined => {
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
};

const optionalNumber = (value: string): number | undefined =>
	value.trim() === "" ? undefined : Number(value);

/**
 * Del formulario a la entrada de la regla de dominio.
 *
 * Es la única traducción entre las dos formas: el formulario es todo texto
 * porque eso producen los inputs, y la regla espera números, booleanos y
 * opcionales ausentes. Las horas siguen siendo de pared: pasarlas a UTC es
 * trabajo del servicio.
 */
export const buildCoursePayload = (
	values: CourseFormValues,
): CreateCourseDto => ({
	title: values.title,
	description: optionalText(values.description),
	modality: values.modality,
	access: values.access,
	dependency: optionalText(values.dependency),
	planLine: optionalText(values.planLine),
	capacity: optionalNumber(values.capacity),
	enrollmentDeadline: optionalText(values.enrollmentDeadline),
	minAttendance: optionalNumber(values.minAttendance),
	requiresEvaluation: values.requiresEvaluation,
	trainers: values.trainers,
	audienceDependencies: values.audienceDependencies,
	audienceGroups: values.audienceGroups,
	sessions: values.sessions.map((session) => ({
		documentId: optionalText(session.documentId),
		date: session.date,
		startTime: session.startTime,
		endTime: session.endTime,
		venue: optionalText(session.venue),
		link: optionalText(session.link),
	})),
});

const formValues = v.custom<CourseFormValues>(() => true);

/**
 * Las reglas del formulario: la MISMA regla del servidor, precedida de la
 * traducción. Los nombres de campo se conservan, así que un error de
 * `sessions.1.startTime` cae en su input sin mapeo adicional.
 */
export const createCourseFormRule = v.pipe(
	formValues,
	v.transform(buildCoursePayload),
	createCourseRule,
);

export const updateCourseFormRule = v.pipe(
	formValues,
	v.transform((values): UpdateCourseDto => {
		// La organizadora no se edita: se descarta antes de validar.
		const { dependency: _dependency, ...payload } = buildCoursePayload(values);
		return payload;
	}),
	updateCourseRule,
);
