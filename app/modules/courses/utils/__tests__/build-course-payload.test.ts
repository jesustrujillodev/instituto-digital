import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	buildCourseFormDefaults,
	type CourseFormValues,
} from "../build-course-form-defaults";
import {
	buildCoursePayload,
	createCourseFormRule,
	updateCourseFormRule,
} from "../build-course-payload";

const TRAINER_ID = "11111111-1111-4111-8111-111111111111";

const valuesOf = (
	overrides: Partial<CourseFormValues> = {},
): CourseFormValues => ({
	...buildCourseFormDefaults(),
	title: "Ofimática básica",
	trainers: [TRAINER_ID],
	...overrides,
});

describe("buildCoursePayload", () => {
	test("los textos vacíos pasan a ausentes y los números dejan de ser texto", () => {
		expect(
			buildCoursePayload(
				valuesOf({ capacity: "20", hours: "12", description: "  " }),
			),
		).toMatchObject({
			capacity: 20,
			hours: 12,
			minAttendance: 80,
			description: undefined,
			enrollmentDeadline: undefined,
			dependency: undefined,
		});
	});

	test("las horas vacías viajan ausentes: el servicio las guarda como null", () => {
		expect(buildCoursePayload(valuesOf({ hours: "" })).hours).toBeUndefined();
	});

	test("el curso nace calendarizado y por asistencia", () => {
		expect(buildCoursePayload(valuesOf())).toMatchObject({
			format: "SCHEDULED",
			completionRule: "ATTENDANCE",
		});
	});

	// Cambiar a autogestivo deja atrás las filas ya capturadas en el formulario.
	test("un autogestivo no manda las sesiones que quedaron en el formulario", () => {
		const payload = buildCoursePayload(
			valuesOf({
				format: "SELF_PACED",
				completionRule: "CONTENT",
				requiresEvaluation: true,
				sessions: [
					{
						documentId: "",
						date: "2026-10-05",
						startTime: "09:00",
						endTime: "13:00",
						venue: "Sala A",
						link: "",
					},
				],
			}),
		);

		expect(payload.sessions).toEqual([]);
	});

	test("una sesión nueva no manda documentId", () => {
		const payload = buildCoursePayload(
			valuesOf({
				sessions: [
					{
						documentId: "",
						date: "2026-10-05",
						startTime: "09:00",
						endTime: "13:00",
						venue: "",
						link: "",
					},
				],
			}),
		);

		expect(payload.sessions[0]).toMatchObject({
			documentId: undefined,
			venue: undefined,
		});
	});
});

describe("reglas del formulario", () => {
	// Es la MISMA regla del servidor: si el formulario la pasa, el action también.
	test("un borrador mínimo es válido", () => {
		expect(v.safeParse(createCourseFormRule, valuesOf()).success).toBe(true);
	});

	test("los errores conservan el nombre del campo del formulario", () => {
		const result = v.safeParse(
			createCourseFormRule,
			valuesOf({
				sessions: [
					{
						documentId: "",
						date: "2026-10-05",
						startTime: "9 am",
						endTime: "13:00",
						venue: "",
						link: "",
					},
				],
			}),
		);

		expect(result.success).toBe(false);
		expect(result.issues?.map((issue) => v.getDotPath(issue))).toContain(
			"sessions.0.startTime",
		);
	});

	test("la edición descarta la organizadora antes de validar", () => {
		const result = v.safeParse(
			updateCourseFormRule,
			valuesOf({ dependency: "cualquier-cosa" }),
		);

		expect(result.success).toBe(true);
		expect(result.output).not.toHaveProperty("dependency");
	});
});
