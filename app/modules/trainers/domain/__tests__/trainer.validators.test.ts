import { describe, expect, test } from "vitest";
import {
	validateActivateProfile,
	validateCreateExternalTrainer,
	validateFindTrainer,
	validateListTrainers,
	validateUpdateProfile,
} from "../trainer.validators";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("validadores del catálogo", () => {
	test("devuelven el dto ya parseado", () => {
		expect(
			validateActivateProfile({
				userDocumentId: USER_ID,
				specialty: "Protección civil",
			}),
		).toEqual({ userDocumentId: USER_ID, specialty: "Protección civil" });

		expect(validateFindTrainer({ userDocumentId: USER_ID })).toEqual({
			userDocumentId: USER_ID,
		});

		expect(validateUpdateProfile({})).toEqual({});
		expect(validateListTrainers({})).toEqual({});
	});

	// Lanzan ValiError: quien llama lo envuelve en `parseInput`, que es lo que lo
	// convierte en la rama de validación del envelope.
	test("lanzan cuando el dato no cumple", () => {
		expect(() => validateFindTrainer({ userDocumentId: "x" })).toThrow();
		expect(() => validateCreateExternalTrainer({})).toThrow();
	});
});
