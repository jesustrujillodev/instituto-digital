import { describe, expect, test } from "vitest";
import {
	CREDIT_ERROR_CODES,
	CreditForbiddenScopeError,
} from "../credit.errors";
import { summarizeMine, toMyCredit } from "../credit.mapper";
import type { MyCredit } from "../credit.types";

const creditOf = (
	fiscalYear: number,
	documentId: string,
	dependencyName = "Obras Públicas",
): MyCredit => ({
	documentId,
	dependencyName,
	fiscalYear,
	grantedAt: new Date(`${fiscalYear}-06-01T00:00:00.000Z`),
	course: {
		documentId: `c-${documentId}`,
		title: `Curso ${documentId}`,
		modality: "IN_PERSON",
		coverUrl: null,
		dependencyName: "Recursos Humanos",
		sessionCount: 1,
		firstSessionAt: null,
		lastSessionEndsAt: null,
		totalMinutes: 0,
	},
	attendedSessions: 1,
	grade: null,
});

describe("summarizeMine", () => {
	test("separa el total del ejercicio del acumulado histórico", () => {
		const summary = summarizeMine(
			[creditOf(2026, "a"), creditOf(2026, "b"), creditOf(2025, "c")],
			2026,
		);

		expect(summary).toMatchObject({
			fiscalYear: 2026,
			yearTotal: 2,
			historicTotal: 3,
			years: [
				{ fiscalYear: 2026, total: 2 },
				{ fiscalYear: 2025, total: 1 },
			],
		});
		expect(summary.credits.map((credit) => credit.documentId)).toEqual([
			"a",
			"b",
		]);
	});

	test("el ejercicio pedido aparece aunque no tenga créditos", () => {
		expect(summarizeMine([creditOf(2025, "c")], 2027).years).toEqual([
			{ fiscalYear: 2027, total: 0 },
			{ fiscalYear: 2025, total: 1 },
		]);
	});

	test("reparte el ejercicio por la dependencia para la que cuenta", () => {
		const summary = summarizeMine(
			[
				creditOf(2026, "a", "Tesorería"),
				creditOf(2026, "b", "DIF"),
				creditOf(2026, "c", "DIF"),
				creditOf(2025, "d", "Tesorería"),
			],
			2026,
		);

		expect(summary.byDependency).toEqual([
			{ label: "DIF", total: 2 },
			{ label: "Tesorería", total: 1 },
		]);
	});
});

describe("toMyCredit", () => {
	const raw = {
		documentId: "k",
		fiscalYear: 2026,
		grantedAt: new Date("2026-10-05T18:00:00.000Z"),
		dependency: { name: "DIF" },
		course: {
			documentId: "c",
			title: "Liderazgo",
			modality: "HYBRID" as const,
			coverImageUrl: "/api/storage?key=media%2Fc.png",
			dependency: { name: "Oficialía Mayor" },
			sessions: [
				{
					startsAt: new Date("2026-09-12T16:00:00.000Z"),
					endsAt: new Date("2026-09-12T18:00:00.000Z"),
				},
				{
					startsAt: new Date("2026-10-03T16:00:00.000Z"),
					endsAt: new Date("2026-10-03T17:30:00.000Z"),
				},
			],
			enrollments: [{ grade: 92 }],
		},
	};

	test("resume las sesiones del curso y el desempeño de la persona", () => {
		const credit = toMyCredit(raw, 1, (reference) => `cdn:${reference}`);

		expect(credit).toMatchObject({
			dependencyName: "DIF",
			attendedSessions: 1,
			grade: 92,
			course: {
				dependencyName: "Oficialía Mayor",
				coverUrl: "cdn:/api/storage?key=media%2Fc.png",
				sessionCount: 2,
				firstSessionAt: raw.course.sessions[0].startsAt,
				lastSessionEndsAt: raw.course.sessions[1].endsAt,
				totalMinutes: 210,
			},
		});
	});

	test("sin sesiones ni inscripción no inventa fechas ni nota", () => {
		const credit = toMyCredit(
			{ ...raw, course: { ...raw.course, sessions: [], enrollments: [] } },
			0,
			() => null,
		);

		expect(credit.course).toMatchObject({
			sessionCount: 0,
			firstSessionAt: null,
			lastSessionEndsAt: null,
			totalMinutes: 0,
		});
		expect(credit.grade).toBeNull();
	});
});

describe("errores de créditos", () => {
	test("expone su código estable", () => {
		expect(new CreditForbiddenScopeError().code).toBe(
			CREDIT_ERROR_CODES.FORBIDDEN_SCOPE,
		);
	});
});
