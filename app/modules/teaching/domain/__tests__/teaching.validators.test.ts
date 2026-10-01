import { describe, expect, test } from "vitest";
import {
	validateListTeachingCourses,
	validateSaveAttendance,
} from "../teaching.validators";
import { ANA_DOC, SESSION_DOCS } from "./teaching.fixtures";

describe("validateSaveAttendance", () => {
	test("acepta una lista con al menos una marca", () => {
		expect(
			validateSaveAttendance({
				sessionDocumentId: SESSION_DOCS[0],
				marks: [{ userDocumentId: ANA_DOC, attended: true }],
			}),
		).toEqual({
			sessionDocumentId: SESSION_DOCS[0],
			marks: [{ userDocumentId: ANA_DOC, attended: true }],
		});
	});

	test("rechaza una lista vacía o una marca que no es booleana", () => {
		expect(() =>
			validateSaveAttendance({ sessionDocumentId: SESSION_DOCS[0], marks: [] }),
		).toThrow();
		expect(() =>
			validateSaveAttendance({
				sessionDocumentId: SESSION_DOCS[0],
				marks: [{ userDocumentId: ANA_DOC, attended: "sí" }],
			}),
		).toThrow();
	});
});

describe("validateListTeachingCourses", () => {
	test("acepta los órdenes de la allowlist", () => {
		expect(
			validateListTeachingCourses({ sortBy: "title", sortDir: "asc" }),
		).toMatchObject({ sortBy: "title", sortDir: "asc" });
	});

	// El valor llega del query string y acaba en un `orderBy`.
	test("rechaza un campo fuera de la allowlist", () => {
		expect(() =>
			validateListTeachingCourses({ sortBy: "enrolledCount" }),
		).toThrow();
		expect(() =>
			validateListTeachingCourses({ sortDir: "sideways" }),
		).toThrow();
	});
});
