import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import type { CourseDetail } from "../../domain/course.types";
import {
	buildCourseFormDefaults,
	emptySessionValues,
} from "../build-course-form-defaults";

const course = {
	title: "Ofimática",
	description: null,
	modality: "HYBRID",
	access: "RESTRICTED",
	capacity: 20,
	enrollmentDeadline: zonedInputToUtc("2026-11-01", "23:59"),
	minAttendance: 90,
	requiresEvaluation: true,
	trainers: [{ userDocumentId: "trainer-1" }],
	audience: {
		dependencies: [{ documentId: "dep-1", name: "RRHH" }],
		groups: [{ documentId: "grp-1", name: "Inducción" }],
	},
	sessions: [
		{
			id: 1,
			documentId: "ses-1",
			startsAt: zonedInputToUtc("2026-11-20", "09:00"),
			endsAt: zonedInputToUtc("2026-11-20", "13:00"),
			venue: "Sala A",
			link: null,
		},
	],
} as unknown as CourseDetail;

describe("buildCourseFormDefaults", () => {
	// Ningún campo puede nacer `undefined`: react-hook-form perdería `isDirty`.
	test("un alta arranca sin ningún campo indefinido", () => {
		const defaults = buildCourseFormDefaults();

		for (const value of Object.values(defaults)) {
			expect(value).not.toBeUndefined();
		}
		expect(defaults).toMatchObject({
			modality: "IN_PERSON",
			access: "PUBLIC",
			minAttendance: "80",
			sessions: [],
		});
	});

	// La hora guardada en UTC vuelve a la de Tijuana aquí; si no, la sesión de
	// noviembre se precargaría corrida y se guardaría corrida al volver a enviar.
	test("la edición precarga las horas en la zona del instituto", () => {
		expect(buildCourseFormDefaults(course).sessions).toEqual([
			{
				documentId: "ses-1",
				date: "2026-11-20",
				startTime: "09:00",
				endTime: "13:00",
				venue: "Sala A",
				link: "",
			},
		]);
	});

	test("la edición precarga selecciones, números como texto y la fecha límite", () => {
		expect(buildCourseFormDefaults(course)).toMatchObject({
			capacity: "20",
			minAttendance: "90",
			enrollmentDeadline: "2026-11-01",
			description: "",
			trainers: ["trainer-1"],
			audienceDependencies: ["dep-1"],
			audienceGroups: ["grp-1"],
		});
	});
});

describe("emptySessionValues", () => {
	test("una fila nueva trae todas sus claves", () => {
		expect(Object.keys(emptySessionValues()).sort()).toEqual(
			["date", "documentId", "endTime", "link", "startTime", "venue"].sort(),
		);
	});
});
