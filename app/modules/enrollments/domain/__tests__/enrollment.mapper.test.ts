import { describe, expect, test } from "vitest";
import {
	type EnrollmentCourseRaw,
	toAvailableCourse,
	toEnrollmentCourse,
	toRosterEntry,
	withAvailability,
} from "../enrollment.mapper";

const rawOf = (
	overrides: Partial<EnrollmentCourseRaw> = {},
): EnrollmentCourseRaw => ({
	id: 7,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	title: "Protección civil básica",
	description: null,
	hours: null,
	coverImageUrl: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	access: "INVITATION",
	status: "PUBLISHED",
	capacity: 2,
	enrollmentDeadline: null,
	enrollmentClosedAt: null,
	finishedAt: null,
	dependency: { name: "SEDESOL" },
	_count: { enrollments: 1 },
	sessions: [
		{
			documentId: "s1",
			startsAt: new Date("2026-10-22T16:00:00Z"),
			endsAt: new Date("2026-10-22T18:00:00Z"),
			venue: "Sala B",
			link: null,
		},
		{
			documentId: "s2",
			startsAt: new Date("2026-10-23T16:00:00Z"),
			endsAt: new Date("2026-10-23T18:00:00Z"),
			venue: "Sala B",
			link: null,
		},
	],
	trainers: [
		{ user: { firstName: "Diana", lastName: null, email: "diana@x.mx" } },
	],
	...overrides,
});

const NOW = new Date("2026-10-01T12:00:00Z");

/** Resolutor de portada de prueba: la key ya viene resuelta a un dominio. */
const cdn = (reference: string | null) =>
	reference ? `https://cdn.test${reference}` : null;

describe("toEnrollmentCourse", () => {
	test("aplana dependencia, conteo y rango de sesiones", () => {
		const course = toEnrollmentCourse(rawOf(), cdn);

		expect(course).toMatchObject({
			dependencyName: "SEDESOL",
			enrolledCount: 1,
			firstSessionAt: new Date("2026-10-22T16:00:00Z"),
			lastSessionEndsAt: new Date("2026-10-23T18:00:00Z"),
			trainers: [{ firstName: "Diana", lastName: null, email: "diana@x.mx" }],
		});
	});

	test("sin sesiones deja el rango en null", () => {
		expect(toEnrollmentCourse(rawOf({ sessions: [] }), cdn)).toMatchObject({
			firstSessionAt: null,
			lastSessionEndsAt: null,
		});
	});

	test("resuelve las horas: las capturadas, o las de sus sesiones", () => {
		expect(toEnrollmentCourse(rawOf({ hours: 12 }), cdn).hours).toBe(12);
		expect(toEnrollmentCourse(rawOf(), cdn).hours).toBe(4);
		expect(toEnrollmentCourse(rawOf({ sessions: [] }), cdn).hours).toBeNull();
	});
});

describe("disponibilidad", () => {
	test("withAvailability calcula lugares, cierre y apertura", () => {
		const course = toEnrollmentCourse(rawOf(), cdn);

		expect(withAvailability(course, new Date("2026-10-01"))).toMatchObject({
			seatsLeft: 1,
			closesAt: new Date("2026-10-22T16:00:00Z"),
			isOpen: true,
		});
	});

	test("toAvailableCourse conserva el estado propio", () => {
		const available = toAvailableCourse(
			toEnrollmentCourse(rawOf(), cdn),
			"INVITED",
			NOW,
		);

		expect(available).toMatchObject({
			sessionCount: 2,
			seatsLeft: 1,
			myStatus: "INVITED",
			trainerName: "Diana",
			trainerCount: 1,
		});
	});
});

describe("portada", () => {
	test("la referencia persistida se resuelve con el resolutor inyectado", () => {
		const raw = rawOf({
			coverImageUrl: "/api/storage?key=media/portadas/a.webp",
		});

		expect(toEnrollmentCourse(raw, cdn).coverUrl).toBe(
			"https://cdn.test/api/storage?key=media/portadas/a.webp",
		);
	});

	test("un curso sin portada queda en null", () => {
		expect(toEnrollmentCourse(rawOf(), cdn).coverUrl).toBeNull();
	});
});

describe("cierre próximo", () => {
	// La urgencia la decide el reloj del servidor, no el del navegador: el mapper
	// recibe `now` y devuelve un booleano ya resuelto.
	test("marca el curso cuya inscripción cierra dentro de la ventana", () => {
		const course = toEnrollmentCourse(rawOf(), cdn);

		expect(
			toAvailableCourse(course, null, new Date("2026-10-20T12:00:00Z")),
		).toMatchObject({ closesSoon: true });

		expect(
			toAvailableCourse(course, null, new Date("2026-10-01T12:00:00Z")),
		).toMatchObject({ closesSoon: false });
	});

	test("sin sesiones no hay cierre y por tanto no hay urgencia", () => {
		const course = toEnrollmentCourse(rawOf({ sessions: [] }), cdn);

		expect(toAvailableCourse(course, null, NOW)).toMatchObject({
			closesAt: null,
			closesSoon: false,
		});
	});
});

describe("toRosterEntry", () => {
	test("usa la dependencia con la que se inscribió", () => {
		const entry = toRosterEntry({
			documentId: "e1",
			origin: "ASSIGNED",
			status: "ENROLLED",
			result: "PENDING",
			updatedAt: new Date(0),
			dependency: { name: "SOP" },
			user: {
				documentId: "u1",
				firstName: "Carlos",
				lastName: null,
				email: "carlos@x.mx",
			},
		});

		expect(entry).toMatchObject({
			userDocumentId: "u1",
			dependencyName: "SOP",
			origin: "ASSIGNED",
		});
	});
});
