import type { CourseFormValues } from "./build-course-form-defaults";

export type CourseFormSectionKey =
	| "general"
	| "program"
	| "people"
	| "attendance";

/**
 * Qué campos viven en cada sección del formulario. Es lo que permite marcar en
 * el índice la sección que tiene errores, incluso si está fuera de la vista.
 */
export const COURSE_FORM_SECTIONS: readonly {
	key: CourseFormSectionKey;
	title: string;
	fields: readonly (keyof CourseFormValues | "audience")[];
}[] = [
	{
		key: "general",
		title: "Datos generales",
		fields: ["dependency", "planLine", "title", "description"],
	},
	{ key: "program", title: "Programa", fields: ["modality", "sessions"] },
	{
		key: "people",
		title: "Capacitadores e inscripción",
		fields: [
			"trainers",
			"access",
			"audience",
			"audienceDependencies",
			"audienceGroups",
			"capacity",
			"enrollmentDeadline",
		],
	},
	{
		key: "attendance",
		title: "Asistencia y evaluación",
		fields: [
			"minAttendance",
			"qrOpensBeforeMinutes",
			"qrClosesAfterMinutes",
			"requiresEvaluation",
		],
	},
];

export const sectionIdOf = (key: CourseFormSectionKey) => `curso-${key}`;

/**
 * Secciones con al menos un error. Un error de servidor llega con la ruta del
 * campo (`sessions.2.venue`): cuenta su primer segmento.
 */
export const sectionsWithErrors = (
	errorPaths: readonly string[],
): Set<CourseFormSectionKey> => {
	const roots = new Set(errorPaths.map((path) => path.split(".")[0]));

	return new Set(
		COURSE_FORM_SECTIONS.filter((section) =>
			section.fields.some((field) => roots.has(field)),
		).map((section) => section.key),
	);
};
