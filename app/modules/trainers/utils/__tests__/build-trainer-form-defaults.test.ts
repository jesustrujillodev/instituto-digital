import { describe, expect, test } from "vitest";
import type { TrainerDetail } from "../../domain/trainer.types";
import { buildTrainerFormDefaults } from "../build-trainer-form-defaults";

const trainer: TrainerDetail = {
	userDocumentId: "11111111-1111-4111-8111-111111111111",
	firstName: "Ana",
	lastName: "Ruiz",
	email: "ana@instituto.gob.mx",
	type: "INTERNAL",
	specialty: "Protección civil",
	institution: null,
	dependencyName: "Obras Públicas",
	archivedAt: null,
	phone: null,
	bio: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	coursesTaught: 0,
	averageRating: null,
};

describe("buildTrainerFormDefaults", () => {
	// Ningún campo puede quedar undefined: react-hook-form nacería con inputs no
	// controlados y `isDirty` dejaría de ser fiable.
	test("las columnas nulas se representan como cadena vacía", () => {
		expect(buildTrainerFormDefaults(trainer)).toEqual({
			specialty: "Protección civil",
			institution: "",
			bio: "",
		});
	});

	test("sin perfil devuelve el formulario vacío", () => {
		expect(buildTrainerFormDefaults(null)).toEqual({
			specialty: "",
			institution: "",
			bio: "",
		});
	});
});
