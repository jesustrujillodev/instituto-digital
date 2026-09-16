import { describe, expect, test } from "vitest";
import {
	COURSE_DEFAULTS,
	COURSE_LIST_DEFAULTS,
	COURSE_MAX_SESSIONS,
} from "../course.config";

describe("COURSE_LIST_DEFAULTS", () => {
	// Fuente única: loader, servicio y repositorio. Dos defaults distintos
	// producen una `pagination` que no describe la página consultada.
	test("es la fuente única de la paginación del listado", () => {
		expect(COURSE_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 10 });
	});
});

describe("COURSE_DEFAULTS", () => {
	test("la asistencia mínima por defecto es la de §6.8", () => {
		expect(COURSE_DEFAULTS.minAttendance).toBe(80);
	});
});

describe("COURSE_MAX_SESSIONS", () => {
	test("admite varias semanas de sesiones", () => {
		expect(COURSE_MAX_SESSIONS).toBeGreaterThanOrEqual(20);
	});
});
