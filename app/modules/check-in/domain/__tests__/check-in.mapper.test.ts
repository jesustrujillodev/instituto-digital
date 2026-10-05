import { describe, expect, test } from "vitest";
import type { CourseModality } from "@/modules/courses/domain/course.rules";
import { toCheckInSessionView } from "../check-in.mapper";
import type { CheckInCourse, CheckInSession } from "../check-in.types";

const MEET = "https://meet.google.com/abc-defg-hij";

const sessionOf = (id: number, link: string | null): CheckInSession => ({
	id,
	documentId: `session-${id}`,
	startsAt: new Date("2026-10-06T17:00:00.000Z"),
	endsAt: new Date("2026-10-06T19:00:00.000Z"),
	venue: null,
	link,
});

const courseOf = (
	modality: CourseModality,
	sessions: CheckInSession[],
): CheckInCourse => ({
	id: 10,
	documentId: "course-doc",
	title: "Seguridad en obra",
	status: "PUBLISHED",
	modality,
	dependencyName: "Obras Públicas",
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	sessions,
});

describe("toCheckInSessionView", () => {
	test.each(["ONLINE", "HYBRID"] as const)(
		"en un curso %s lleva el enlace de la sesión",
		(modality) => {
			const session = sessionOf(1, MEET);

			expect(
				toCheckInSessionView(courseOf(modality, [session]), session).link,
			).toBe(MEET);
		},
	);

	test("un curso presencial no muestra el enlace que quedó guardado", () => {
		const session = sessionOf(1, MEET);

		expect(
			toCheckInSessionView(courseOf("IN_PERSON", [session]), session).link,
		).toBeNull();
	});

	test("una sesión sin enlace sigue sin él", () => {
		const session = sessionOf(1, null);

		expect(
			toCheckInSessionView(courseOf("ONLINE", [session]), session).link,
		).toBeNull();
	});

	test("el ordinal sale de la posición en el curso", () => {
		const first = sessionOf(1, null);
		const second = sessionOf(2, MEET);

		expect(
			toCheckInSessionView(courseOf("ONLINE", [first, second]), second),
		).toMatchObject({ ordinal: 2, total: 2 });
	});
});
