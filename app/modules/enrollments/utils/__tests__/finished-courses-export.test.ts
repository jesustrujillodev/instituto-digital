import { describe, expect, test } from "vitest";
import type { EnrollmentCourse } from "../../domain/enrollment.types";
import {
	finishedCoursesFileName,
	toFinishedCoursesSheets,
} from "../finished-courses-export";

const courseOf = (
	overrides: Partial<EnrollmentCourse> = {},
): EnrollmentCourse => ({
	id: 7,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	dependencyName: "SEDESOL",
	title: "Atención ciudadana",
	description: "Trato al público",
	coverUrl: null,
	modality: "HYBRID",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	access: "INVITATION",
	status: "FINISHED",
	capacity: 20,
	enrolledCount: 12,
	enrollmentDeadline: null,
	enrollmentClosedAt: null,
	finishedAt: new Date("2026-10-22T20:00:00.000Z"),
	sessions: [
		{
			documentId: "s1",
			startsAt: new Date("2026-10-20T16:00:00.000Z"),
			endsAt: new Date("2026-10-20T19:00:00.000Z"),
			venue: "Sala B",
			link: null,
		},
		{
			documentId: "s2",
			startsAt: new Date("2026-10-21T16:00:00.000Z"),
			endsAt: new Date("2026-10-21T17:30:00.000Z"),
			venue: null,
			link: "https://meet.example.com/abc",
		},
	],
	trainers: [],
	firstSessionAt: new Date("2026-10-20T16:00:00.000Z"),
	lastSessionEndsAt: new Date("2026-10-21T17:30:00.000Z"),
	...overrides,
});

describe("toFinishedCoursesSheets", () => {
	test("una fila por curso con su copia en español y las horas sumadas", () => {
		const course = courseOf();

		const [courses] = toFinishedCoursesSheets([course]);

		expect(courses.name).toBe("Cursos");
		expect(courses.rows).toEqual([
			[
				"Atención ciudadana",
				"Trato al público",
				"SEDESOL",
				"Finalizado",
				"Híbrida",
				"Por invitación",
				20,
				12,
				2,
				4.5,
				course.firstSessionAt,
				course.lastSessionEndsAt,
				course.finishedAt,
			],
		]);
	});

	test("una fila por sesión, numerada dentro de su curso", () => {
		const [, sessions] = toFinishedCoursesSheets([
			courseOf(),
			courseOf({ title: "Ética pública", sessions: [courseOf().sessions[0]] }),
		]);

		expect(sessions.name).toBe("Sesiones");
		expect(sessions.rows.map((row) => [row[0], row[1], row[5]])).toEqual([
			["Atención ciudadana", 1, 3],
			["Atención ciudadana", 2, 1.5],
			["Ética pública", 1, 3],
		]);
		expect(sessions.rows[1].slice(6)).toEqual([
			null,
			"https://meet.example.com/abc",
		]);
	});

	test("un cancelado sin sesiones ni cierre deja esas celdas vacías", () => {
		const [courses, sessions] = toFinishedCoursesSheets([
			courseOf({
				status: "CANCELLED",
				capacity: null,
				finishedAt: null,
				sessions: [],
				firstSessionAt: null,
				lastSessionEndsAt: null,
			}),
		]);

		expect(courses.rows[0][3]).toBe("Cancelado");
		expect(courses.rows[0][6]).toBeNull();
		expect(courses.rows[0].slice(8)).toEqual([0, 0, null, null, null]);
		expect(sessions.rows).toEqual([]);
	});

	test("cada fila trae una celda por columna", () => {
		for (const sheet of toFinishedCoursesSheets([courseOf()])) {
			for (const row of sheet.rows) {
				expect(row).toHaveLength(sheet.columns.length);
			}
		}
	});
});

describe("finishedCoursesFileName", () => {
	test("usa la fecha del instituto, no la de UTC", () => {
		// 03:00 UTC del 20 son las 20:00 del 19 en Tijuana.
		expect(finishedCoursesFileName(new Date("2026-09-20T03:00:00.000Z"))).toBe(
			"mis-cursos-finalizados-2026-09-19.xlsx",
		);
	});
});
