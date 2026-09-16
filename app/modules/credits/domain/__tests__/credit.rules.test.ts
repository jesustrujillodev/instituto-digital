import { describe, expect, test } from "vitest";
import { diffCredits } from "../credit.rules";
import {
	validateCreditsOverviewQuery,
	validateMyCreditsQuery,
} from "../credit.validators";

const REVOKED_AT = new Date("2026-09-10T00:00:00.000Z");

describe("diffCredits", () => {
	test("otorga a quien completó por primera vez", () => {
		expect(diffCredits([], [{ userId: 1, dependencyId: 3 }])).toEqual({
			grant: [{ userId: 1, dependencyId: 3 }],
			restore: [],
			revoke: [],
		});
	});

	test("retira a quien dejó de cumplir y no vuelve a retirar lo ya retirado", () => {
		expect(
			diffCredits(
				[
					{ userId: 1, dependencyId: 3, revokedAt: null },
					{ userId: 2, dependencyId: 3, revokedAt: REVOKED_AT },
				],
				[],
			),
		).toEqual({ grant: [], restore: [], revoke: [1] });
	});

	test("restaura en vez de crear: la fila conserva su dependencia original", () => {
		const diff = diffCredits(
			[{ userId: 1, dependencyId: 3, revokedAt: REVOKED_AT }],
			// Hoy pertenece a otra dependencia; el crédito sigue contando para la 3.
			[{ userId: 1, dependencyId: 4 }],
		);

		expect(diff).toEqual({ grant: [], restore: [1], revoke: [] });
	});

	test("un crédito vigente que sigue cumpliendo no cambia", () => {
		expect(
			diffCredits(
				[{ userId: 1, dependencyId: 3, revokedAt: null }],
				[{ userId: 1, dependencyId: 3 }],
			),
		).toEqual({ grant: [], restore: [], revoke: [] });
	});
});

describe("validadores de consulta", () => {
	test("el ejercicio es opcional y entero dentro del rango", () => {
		expect(validateMyCreditsQuery({})).toEqual({});
		expect(validateMyCreditsQuery({ fiscalYear: 2026 })).toEqual({
			fiscalYear: 2026,
		});
		expect(() => validateMyCreditsQuery({ fiscalYear: 1999 })).toThrow();
	});

	test("la dependencia del resumen es un uuid", () => {
		expect(() =>
			validateCreditsOverviewQuery({ dependency: "obras-publicas" }),
		).toThrow();
	});
});
