import { describe, expect, test } from "vitest";
import {
	validateCourseSession,
	validateCreateCourse,
	validateFindCourse,
	validateListCourses,
	validateUpdateCourse,
} from "../course.validators";

const DOCUMENT_ID = "0b6c6d8e-1c2a-4f3b-9d4e-5f6a7b8c9d0e";

const validCourse = {
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	trainers: [DOCUMENT_ID],
	sessions: [],
};

describe("validateCreateCourse", () => {
	test("acepta un borrador sin sesiones: se completa después", () => {
		expect(validateCreateCourse(validCourse).sessions).toEqual([]);
	});

	test("recorta el título antes de validarlo", () => {
		expect(
			validateCreateCourse({ ...validCourse, title: "  Ofimática  " }).title,
		).toBe("Ofimática");
	});

	test.each([
		["un título de dos letras", { title: "Of" }],
		["una modalidad inventada", { modality: "REMOTE" }],
		["un acceso inventado", { access: "SECRET" }],
		["una asistencia mínima de 0", { minAttendance: 0 }],
		["una asistencia mínima de 101", { minAttendance: 101 }],
		["un cupo de 0", { capacity: 0 }],
		["cero horas", { hours: 0 }],
		["más de 500 horas", { hours: 501 }],
		["media hora de más", { hours: 1.5 }],
		["horas como texto", { hours: "20" }],
		["un capacitador que no es uuid", { trainers: ["12345"] }],
		["una fecha límite con otro formato", { enrollmentDeadline: "12/10/2026" }],
	])("rechaza %s", (_case, override) => {
		expect(() =>
			validateCreateCourse({ ...validCourse, ...override }),
		).toThrow();
	});
});

describe("horas del curso", () => {
	test.each([1, 500])("acepta %i horas", (hours) => {
		expect(validateCreateCourse({ ...validCourse, hours }).hours).toBe(hours);
	});

	test("son opcionales: un curso sin horas es válido", () => {
		expect(validateCreateCourse(validCourse).hours).toBeUndefined();
	});

	test("se editan con la misma regla que el alta", () => {
		expect(() => validateUpdateCourse({ ...validCourse, hours: 0 })).toThrow();
		expect(validateUpdateCourse({ ...validCourse, hours: 12 }).hours).toBe(12);
	});
});

describe("validateUpdateCourse", () => {
	// Un curso no cambia de dependencia: moverlo arrastraría su audiencia, sus
	// capacitadores y los créditos que otorgó a nombre de la anterior.
	test("descarta la dependencia organizadora si alguien la envía", () => {
		const parsed = validateUpdateCourse({
			...validCourse,
			dependency: DOCUMENT_ID,
		});

		expect(parsed).not.toHaveProperty("dependency");
	});
});

describe("validateCourseSession", () => {
	test("acepta una sesión con fecha y horas de pared", () => {
		expect(
			validateCourseSession({
				date: "2026-10-05",
				startTime: "09:00",
				endTime: "13:00",
				venue: "Sala A",
			}),
		).toMatchObject({ date: "2026-10-05", startTime: "09:00" });
	});

	test("conserva el documentId de una sesión existente", () => {
		expect(
			validateCourseSession({
				documentId: DOCUMENT_ID,
				date: "2026-10-05",
				startTime: "09:00",
				endTime: "13:00",
			}).documentId,
		).toBe(DOCUMENT_ID);
	});

	test.each([
		["una hora de 12 horas", { startTime: "9:00 AM" }],
		["una hora fuera de rango", { startTime: "25:00" }],
		["una fecha en otro formato", { date: "05-10-2026" }],
		// El enlace es de la sesión, no del curso: la plataforma no aloja
		// contenido y cada sesión puede tener el suyo.
		["un enlace que no es URL", { link: "meet.example" }],
	])("rechaza %s", (_case, override) => {
		expect(() =>
			validateCourseSession({
				date: "2026-10-05",
				startTime: "09:00",
				endTime: "13:00",
				...override,
			}),
		).toThrow();
	});
});

describe("validateListCourses", () => {
	test("acepta los filtros del listado", () => {
		expect(
			validateListCourses({
				page: 2,
				pageSize: 10,
				status: "PUBLISHED",
				modality: "HYBRID",
				sortBy: "title",
				sortDir: "desc",
			}),
		).toMatchObject({ page: 2, status: "PUBLISHED" });
	});

	// La allowlist no es cosmética: el valor llega del query string y acaba en
	// un `orderBy`.
	test("rechaza ordenar por una columna fuera de la allowlist", () => {
		expect(() => validateListCourses({ sortBy: "minAttendance" })).toThrow();
	});

	test("rechaza una página de más de 100 elementos", () => {
		expect(() => validateListCourses({ pageSize: 500 })).toThrow();
	});
});

describe("validateFindCourse", () => {
	test("exige un uuid, no cualquier texto de la URL", () => {
		expect(validateFindCourse({ documentId: DOCUMENT_ID }).documentId).toBe(
			DOCUMENT_ID,
		);
		expect(() => validateFindCourse({ documentId: "42" })).toThrow();
	});
});
