import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { canManagePlans, planScopeWhere } from "../annual-plan.access";
import {
	ANNUAL_PLAN_ERROR_CODES,
	AnnualPlanAlreadyExistsError,
	AnnualPlanLineHasActiveCourseError,
	AnnualPlanReadOnlyError,
} from "../annual-plan.errors";
import { toPlanDetail } from "../annual-plan.mapper";
import type { StoredPlan, StoredPlanLine } from "../annual-plan.types";
import {
	validateCreatePlan,
	validatePlanLine,
} from "../annual-plan.validators";

const NOW = zonedInputToUtc("2026-09-16", "10:00");

describe("alcance", () => {
	test("el superadministrador lee todo pero no gestiona", () => {
		expect(planScopeWhere({ kind: "global" })).toEqual({});
		expect(canManagePlans({ kind: "global" })).toBe(false);
	});

	test("titular y auxiliar leen y gestionan solo su dependencia", () => {
		const scope = { kind: "dependency" as const, dependencyId: 3 };

		expect(planScopeWhere(scope)).toEqual({ dependencyId: 3 });
		expect(canManagePlans(scope)).toBe(true);
	});

	test("un participante nunca recibe {}", () => {
		expect(planScopeWhere({ kind: "self", userId: 1 })).toEqual({
			id: { in: [] },
		});
		expect(planScopeWhere({ kind: "none" })).toEqual({ id: { in: [] } });
	});
});

describe("validadores", () => {
	test("el mes va de 1 a 12 y el título es obligatorio", () => {
		expect(() =>
			validatePlanLine({ title: "Curso", plannedMonth: 0 }),
		).toThrow();
		expect(() =>
			validatePlanLine({ title: "Curso", plannedMonth: 13 }),
		).toThrow();
		expect(() => validatePlanLine({ title: "   ", plannedMonth: 5 })).toThrow();
	});

	test("los textos vacíos se guardan como null", () => {
		expect(
			validatePlanLine({
				title: " Excel básico ",
				plannedMonth: 5,
				estimatedDuration: "  ",
				notes: "Con laboratorio",
			}),
		).toEqual({
			title: "Excel básico",
			plannedMonth: 5,
			plannedModality: null,
			estimatedDuration: null,
			targetAudience: null,
			notes: "Con laboratorio",
		});
	});

	test("el ejercicio es un entero", () => {
		expect(() => validateCreatePlan({ fiscalYear: 2026.5 })).toThrow();
	});
});

describe("errores", () => {
	test("exponen su código estable y los detalles que se interpolan", () => {
		expect(new AnnualPlanLineHasActiveCourseError().code).toBe(
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE,
		);
		expect(new AnnualPlanAlreadyExistsError(2026).details).toEqual({
			fiscalYear: 2026,
		});
		expect(new AnnualPlanReadOnlyError(2025).code).toBe(
			ANNUAL_PLAN_ERROR_CODES.READ_ONLY,
		);
	});
});

describe("toPlanDetail", () => {
	const lineOf = (overrides: Partial<StoredPlanLine> = {}): StoredPlanLine => ({
		id: 1,
		documentId: "line-1",
		title: "Seguridad en obra",
		plannedMonth: 9,
		plannedModality: "HYBRID",
		estimatedDuration: null,
		targetAudience: null,
		notes: null,
		cancelledAt: null,
		courses: [],
		...overrides,
	});

	const planOf = (lines: StoredPlanLine[], fiscalYear = 2026): StoredPlan => ({
		id: 7,
		documentId: "plan-1",
		dependencyId: 3,
		dependencyName: "Obras Públicas",
		fiscalYear,
		lines,
	});

	test("las acciones dependen del estado de cada línea", () => {
		const detail = toPlanDetail(
			planOf([
				lineOf(),
				lineOf({
					documentId: "line-2",
					courses: [
						{
							documentId: "c2",
							title: "Actual",
							status: "PUBLISHED",
							format: "SCHEDULED",
						},
						{
							documentId: "c1",
							title: "Viejo",
							status: "CANCELLED",
							format: "SCHEDULED",
						},
					],
				}),
				lineOf({ documentId: "line-3", cancelledAt: NOW }),
			]),
			true,
			NOW,
		);

		expect(detail.lines[0].can).toEqual({
			edit: true,
			cancel: true,
			reactivate: false,
			delete: true,
			createCourse: true,
		});
		expect(detail.lines[1]).toMatchObject({
			status: "SCHEDULED",
			activeCourse: { title: "Actual" },
			cancelledCourses: 1,
			can: { cancel: false, delete: false, createCourse: false },
		});
		expect(detail.lines[2].can).toMatchObject({
			edit: false,
			reactivate: true,
			createCourse: false,
		});
	});

	test("la línea de un autogestivo publicado sale realizada, con su curso vigente", () => {
		const detail = toPlanDetail(
			planOf([
				lineOf({
					courses: [
						{
							documentId: "c3",
							title: "En línea",
							status: "PUBLISHED",
							format: "SELF_PACED",
						},
					],
				}),
			]),
			true,
			NOW,
		);

		expect(detail.lines[0]).toMatchObject({
			status: "DONE",
			activeCourse: { title: "En línea", format: "SELF_PACED" },
			can: { cancel: false, createCourse: false },
		});
		expect(detail.progress).toMatchObject({ done: 1, ratio: 1 });
	});

	test("un plan pasado o sin permiso de gestión no ofrece acciones", () => {
		for (const detail of [
			toPlanDetail(planOf([lineOf()], 2025), true, NOW),
			toPlanDetail(planOf([lineOf()]), false, NOW),
		]) {
			expect(detail.canManage).toBe(false);
			expect(Object.values(detail.lines[0].can)).not.toContain(true);
		}
	});

	test("no expone el id interno del plan", () => {
		const detail = toPlanDetail(planOf([]), true, NOW);

		expect(detail.plan).toEqual({
			documentId: "plan-1",
			dependencyName: "Obras Públicas",
			fiscalYear: 2026,
		});
	});
});
