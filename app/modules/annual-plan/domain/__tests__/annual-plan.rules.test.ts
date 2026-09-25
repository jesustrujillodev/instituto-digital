import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import { ANNUAL_PLAN_ERROR_CODES } from "../annual-plan.errors";
import {
	activeCourseOf,
	assertCreatableYear,
	assertLineAvailableForCourse,
	assertLineCancellable,
	assertLineDeletable,
	assertLineReactivable,
	creatableYearsOf,
	groupLinesByMonth,
	isLineOpenForCourse,
	isReadOnlyPlan,
	planLineStatusOf,
	planProgressOf,
} from "../annual-plan.rules";

const NOW = zonedInputToUtc("2026-09-16", "10:00");
const CANCELLED_AT = new Date("2026-08-01T00:00:00.000Z");

const lineOf = (
	statuses: CourseStatus[] = [],
	cancelledAt: Date | null = null,
	format: CourseFormat = "SCHEDULED",
) => ({
	cancelledAt,
	courses: statuses.map((status) => ({ status, format })),
});

const selfPacedLineOf = (statuses: CourseStatus[]) =>
	lineOf(statuses, null, "SELF_PACED");

const codeOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return null;
};

describe("planLineStatusOf", () => {
	test("sin curso la línea está pendiente", () => {
		expect(planLineStatusOf(lineOf())).toBe("PENDING");
	});

	test("un curso en borrador o publicado la programa", () => {
		expect(planLineStatusOf(lineOf(["DRAFT"]))).toBe("SCHEDULED");
		expect(planLineStatusOf(lineOf(["PUBLISHED"]))).toBe("SCHEDULED");
	});

	test("un curso finalizado la realiza sin que nadie la toque", () => {
		expect(planLineStatusOf(lineOf(["FINISHED"]))).toBe("DONE");
	});

	test("un curso cancelado la devuelve a pendiente y conserva el historial", () => {
		expect(planLineStatusOf(lineOf(["CANCELLED"]))).toBe("PENDING");
		expect(planLineStatusOf(lineOf(["CANCELLED", "PUBLISHED"]))).toBe(
			"SCHEDULED",
		);
	});

	test("la cancelación manual manda sobre todo lo demás", () => {
		expect(planLineStatusOf(lineOf([], CANCELLED_AT))).toBe("CANCELLED");
	});

	test("un autogestivo la realiza al publicarse, porque no se finaliza", () => {
		expect(planLineStatusOf(selfPacedLineOf(["PUBLISHED"]))).toBe("DONE");
	});

	test("un autogestivo en borrador la programa y cancelado la devuelve a pendiente", () => {
		expect(planLineStatusOf(selfPacedLineOf(["DRAFT"]))).toBe("SCHEDULED");
		expect(planLineStatusOf(selfPacedLineOf(["CANCELLED"]))).toBe("PENDING");
	});

	test("el curso activo es el que no está cancelado", () => {
		expect(
			activeCourseOf([
				{ status: "CANCELLED" as const, title: "viejo" },
				{ status: "DRAFT" as const, title: "nuevo" },
			])?.title,
		).toBe("nuevo");
	});
});

describe("planProgressOf", () => {
	test("realizadas entre el total menos las canceladas", () => {
		expect(
			planProgressOf([
				lineOf(["FINISHED"]),
				lineOf(["PUBLISHED"]),
				lineOf(),
				lineOf([], CANCELLED_AT),
			]),
		).toEqual({ done: 1, total: 4, cancelled: 1, ratio: 1 / 3 });
	});

	test("un autogestivo publicado cuenta como realizado", () => {
		expect(
			planProgressOf([selfPacedLineOf(["PUBLISHED"]), lineOf(["PUBLISHED"])]),
		).toEqual({ done: 1, total: 2, cancelled: 0, ratio: 1 / 2 });
	});

	test("sin nada que medir el avance es null, no cero", () => {
		expect(planProgressOf([]).ratio).toBeNull();
		expect(planProgressOf([lineOf([], CANCELLED_AT)]).ratio).toBeNull();
	});
});

describe("ejercicios", () => {
	test("un plan de un año anterior es de solo lectura", () => {
		expect(isReadOnlyPlan({ fiscalYear: 2025 }, NOW)).toBe(true);
		expect(isReadOnlyPlan({ fiscalYear: 2026 }, NOW)).toBe(false);
	});

	test("el año se toma en la zona del instituto", () => {
		// 20:00 del 31 de diciembre en Tijuana ya es 2027 en UTC.
		const newYearsEve = zonedInputToUtc("2026-12-31", "20:00");

		expect(isReadOnlyPlan({ fiscalYear: 2026 }, newYearsEve)).toBe(false);
	});

	test("se crea el plan del ejercicio actual o del siguiente", () => {
		expect(() => assertCreatableYear(2026, NOW)).not.toThrow();
		expect(() => assertCreatableYear(2027, NOW)).not.toThrow();
		expect(codeOf(() => assertCreatableYear(2025, NOW))).toBe(
			ANNUAL_PLAN_ERROR_CODES.INVALID_YEAR,
		);
		expect(codeOf(() => assertCreatableYear(2028, NOW))).toBe(
			ANNUAL_PLAN_ERROR_CODES.INVALID_YEAR,
		);
	});

	test("solo se ofrecen los ejercicios que faltan", () => {
		expect(creatableYearsOf([2026, 2025], NOW)).toEqual([2027]);
		expect(creatableYearsOf([], NOW)).toEqual([2026, 2027]);
	});
});

describe("operaciones sobre una línea", () => {
	const current = { fiscalYear: 2026 };

	test("crear curso exige línea vigente, sin curso activo y plan no pasado", () => {
		expect(() =>
			assertLineAvailableForCourse(lineOf(["CANCELLED"]), current, NOW),
		).not.toThrow();
		expect(
			codeOf(() =>
				assertLineAvailableForCourse(lineOf(["DRAFT"]), current, NOW),
			),
		).toBe(ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE);
		expect(
			codeOf(() =>
				assertLineAvailableForCourse(lineOf([], CANCELLED_AT), current, NOW),
			),
		).toBe(ANNUAL_PLAN_ERROR_CODES.LINE_CANCELLED);
		expect(
			codeOf(() =>
				assertLineAvailableForCourse(lineOf(), { fiscalYear: 2025 }, NOW),
			),
		).toBe(ANNUAL_PLAN_ERROR_CODES.READ_ONLY);
	});

	test("no se cancela una línea con curso activo", () => {
		expect(codeOf(() => assertLineCancellable(lineOf(["PUBLISHED"])))).toBe(
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE,
		);
		expect(() => assertLineCancellable(lineOf(["CANCELLED"]))).not.toThrow();
	});

	test("solo se reactiva una cancelada", () => {
		expect(codeOf(() => assertLineReactivable(lineOf()))).toBe(
			ANNUAL_PLAN_ERROR_CODES.LINE_NOT_CANCELLED,
		);
	});

	test("se borra solo si nunca tuvo curso, ni siquiera cancelado", () => {
		expect(() => assertLineDeletable(lineOf())).not.toThrow();
		expect(codeOf(() => assertLineDeletable(lineOf(["CANCELLED"])))).toBe(
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_COURSES,
		);
	});
});

describe("isLineOpenForCourse", () => {
	const lineWith = (
		courses: { documentId: string; status: CourseStatus }[],
		cancelledAt: Date | null = null,
	) => ({ cancelledAt, courses });

	test("una línea libre o con cursos cancelados admite curso", () => {
		expect(isLineOpenForCourse(lineWith([]))).toBe(true);
		expect(
			isLineOpenForCourse(lineWith([{ documentId: "a", status: "CANCELLED" }])),
		).toBe(true);
	});

	test("cancelada u ocupada por otro curso, no", () => {
		expect(isLineOpenForCourse(lineWith([], CANCELLED_AT))).toBe(false);
		expect(
			isLineOpenForCourse(lineWith([{ documentId: "a", status: "DRAFT" }])),
		).toBe(false);
	});

	test("el curso que se edita no se estorba a sí mismo", () => {
		const line = lineWith([{ documentId: "a", status: "DRAFT" }]);

		expect(isLineOpenForCourse(line, "a")).toBe(true);
		expect(isLineOpenForCourse(line, "b")).toBe(false);
	});
});

describe("groupLinesByMonth", () => {
	test("devuelve los doce meses aunque estén vacíos", () => {
		const months = groupLinesByMonth([
			{ plannedMonth: 3, title: "a" },
			{ plannedMonth: 3, title: "b" },
		]);

		expect(months).toHaveLength(12);
		expect(months[2].lines.map((line) => line.title)).toEqual(["a", "b"]);
		expect(months[0].lines).toEqual([]);
	});
});
