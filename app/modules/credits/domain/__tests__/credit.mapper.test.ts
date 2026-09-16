import { describe, expect, test } from "vitest";
import {
	CREDIT_ERROR_CODES,
	CreditForbiddenScopeError,
} from "../credit.errors";
import { summarizeMine } from "../credit.mapper";
import type { MyCredit } from "../credit.types";

const creditOf = (fiscalYear: number, documentId: string): MyCredit => ({
	documentId,
	courseDocumentId: `c-${documentId}`,
	courseTitle: `Curso ${documentId}`,
	dependencyName: "Obras Públicas",
	fiscalYear,
	grantedAt: new Date(`${fiscalYear}-06-01T00:00:00.000Z`),
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
			years: [2026, 2025],
		});
	});

	test("el ejercicio pedido aparece aunque no tenga créditos", () => {
		expect(summarizeMine([creditOf(2025, "c")], 2027).years).toEqual([
			2027, 2025,
		]);
	});
});

describe("errores de créditos", () => {
	test("expone su código estable", () => {
		expect(new CreditForbiddenScopeError().code).toBe(
			CREDIT_ERROR_CODES.FORBIDDEN_SCOPE,
		);
	});
});
