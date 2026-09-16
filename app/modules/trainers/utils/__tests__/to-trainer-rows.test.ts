import { describe, expect, test } from "vitest";
import type { TrainerSummary } from "../../domain/trainer.types";
import { fullNameOf, originOf, toTrainerRows } from "../to-trainer-rows";

const trainerOf = (
	overrides: Partial<TrainerSummary> = {},
): TrainerSummary => ({
	userDocumentId: "11111111-1111-4111-8111-111111111111",
	firstName: "Ana",
	lastName: "Ruiz",
	email: "ana@instituto.gob.mx",
	type: "INTERNAL",
	specialty: "Protección civil",
	institution: null,
	dependencyName: "Obras Públicas",
	archivedAt: null,
	...overrides,
});

describe("toTrainerRows", () => {
	// El identificador de la fila es el de la CUENTA porque el perfil no tiene
	// uno propio: su identidad es la de la persona.
	test("la fila se identifica por el documentId de la cuenta", () => {
		const [row] = toTrainerRows([trainerOf()]);

		expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
		expect(row.id).toBe(row.userDocumentId);
	});
});

describe("fullNameOf", () => {
	test("cae al correo cuando la cuenta no tiene nombre capturado", () => {
		expect(fullNameOf(trainerOf({ firstName: null, lastName: null }))).toBe(
			"ana@instituto.gob.mx",
		);
	});

	test("compone nombre y apellidos", () => {
		expect(fullNameOf(trainerOf())).toBe("Ana Ruiz");
	});
});

describe("originOf", () => {
	test("un interno se sitúa por su dependencia", () => {
		expect(originOf(trainerOf())).toBe("Obras Públicas");
	});

	test("un externo se sitúa por su institución", () => {
		expect(
			originOf(
				trainerOf({
					type: "EXTERNAL",
					dependencyName: null,
					institution: "Universidad Autónoma",
				}),
			),
		).toBe("Universidad Autónoma");
	});
});
