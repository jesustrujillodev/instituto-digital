import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import type { StoredPlanLine } from "../annual-plan.types";
import {
	currentPlanMonth,
	dueLinesOf,
	toPlanCoverage,
} from "../plan-summary.rules";

const lineOf = (
	documentId: string,
	plannedMonth: number,
	overrides: Partial<StoredPlanLine> = {},
): StoredPlanLine => ({
	id: plannedMonth,
	documentId,
	title: documentId,
	plannedMonth,
	plannedModality: null,
	estimatedDuration: null,
	targetAudience: null,
	notes: null,
	cancelledAt: null,
	courses: [],
	...overrides,
});

const linkedCourse = (status: "PUBLISHED" | "FINISHED" | "CANCELLED") => ({
	documentId: "c",
	title: "c",
	status,
	format: "SCHEDULED" as const,
});

describe("currentPlanMonth", () => {
	test("el mes es el de Tijuana, aunque en UTC ya sea el siguiente", () => {
		expect(currentPlanMonth(new Date("2026-10-01T06:30:00.000Z"))).toBe(9);
	});
});

describe("dueLinesOf", () => {
	const OCTOBER = zonedInputToUtc("2026-10-07", "10:00");

	test("pendientes de este mes o atrasadas, las atrasadas primero", () => {
		expect(
			dueLinesOf(
				[lineOf("oct", 10), lineOf("nov", 11), lineOf("ago", 8)],
				OCTOBER,
			),
		).toEqual([
			{ documentId: "ago", title: "ago", plannedMonth: 8, overdue: true },
			{ documentId: "oct", title: "oct", plannedMonth: 10, overdue: false },
		]);
	});

	test("lo cancelado o con curso activo no se pide", () => {
		expect(
			dueLinesOf(
				[
					lineOf("cancelada", 8, { cancelledAt: OCTOBER }),
					lineOf("programada", 9, { courses: [linkedCourse("PUBLISHED")] }),
				],
				OCTOBER,
			),
		).toEqual([]);
	});

	test("una línea cuyo curso se canceló vuelve a pedirse", () => {
		expect(
			dueLinesOf(
				[lineOf("recaída", 9, { courses: [linkedCourse("CANCELLED")] })],
				OCTOBER,
			),
		).toHaveLength(1);
	});

	test("en enero, solo lo de enero", () => {
		const january = zonedInputToUtc("2027-01-05", "10:00");

		expect(
			dueLinesOf([lineOf("ene", 1), lineOf("dic", 12)], january).map(
				(line) => line.documentId,
			),
		).toEqual(["ene"]);
	});
});

describe("toPlanCoverage", () => {
	test("separa los planes con su avance de las dependencias sin plan", () => {
		expect(
			toPlanCoverage(2026, [
				{
					documentId: "d1",
					name: "Obras Públicas",
					plan: {
						documentId: "p1",
						lines: [
							{
								cancelledAt: null,
								courses: [{ status: "FINISHED", format: "SCHEDULED" }],
							},
							{ cancelledAt: null, courses: [] },
						],
					},
				},
				{ documentId: "d2", name: "Desarrollo Social", plan: null },
			]),
		).toEqual({
			fiscalYear: 2026,
			plans: [
				{
					documentId: "p1",
					dependencyName: "Obras Públicas",
					progress: { done: 1, total: 2, cancelled: 0, ratio: 0.5 },
				},
			],
			withoutPlan: [{ documentId: "d2", name: "Desarrollo Social" }],
		});
	});
});
