import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	activateProfileRule,
	createExternalTrainerRule,
	externalProfileFieldsRule,
	profileFieldsRule,
	trainerDetailSchema,
	trainerSummarySchema,
	updateProfileRule,
} from "../trainer.rules";

const validExternal = {
	firstName: "Luis",
	lastName: "Mora",
	email: "luis@universidad.mx",
	password: "Password123!",
	specialty: "Transparencia",
	institution: "Universidad Autónoma",
};

describe("activateProfileRule", () => {
	test("acepta el mínimo: a quién y de qué", () => {
		const parsed = v.parse(activateProfileRule, {
			userDocumentId: "11111111-1111-4111-8111-111111111111",
			specialty: "Protección civil",
		});

		expect(parsed.specialty).toBe("Protección civil");
	});

	test("rechaza un documentId que no es uuid", () => {
		expect(
			v.safeParse(activateProfileRule, {
				userDocumentId: "no-es-uuid",
				specialty: "Protección civil",
			}).success,
		).toBe(false);
	});

	test("la especialidad es obligatoria: es el filtro principal del catálogo", () => {
		expect(
			v.safeParse(activateProfileRule, {
				userDocumentId: "11111111-1111-4111-8111-111111111111",
			}).success,
		).toBe(false);
	});

	// No admite institución: un interno pertenece a una dependencia. Que la regla
	// no la declare es lo que impide que llegue al servicio desde el formulario.
	test("no declara institución", () => {
		expect("institution" in activateProfileRule.entries).toBe(false);
	});
});

describe("updateProfileRule", () => {
	test("todos los campos son opcionales: es una edición parcial", () => {
		expect(v.safeParse(updateProfileRule, {}).success).toBe(true);
	});

	test("recorta la especialidad antes de validarla", () => {
		const parsed = v.parse(updateProfileRule, {
			specialty: "  Primeros auxilios  ",
		});

		expect(parsed.specialty).toBe("Primeros auxilios");
	});

	test("una especialidad demasiado corta no pasa", () => {
		expect(v.safeParse(updateProfileRule, { specialty: "ab" }).success).toBe(
			false,
		);
	});
});

describe("createExternalTrainerRule", () => {
	test("acepta un alta completa", () => {
		expect(v.safeParse(createExternalTrainerRule, validExternal).success).toBe(
			true,
		);
	});

	// Es lo que sitúa al externo: sin dependencia ni número de empleado, la
	// institución es su única procedencia.
	test("la institución es obligatoria", () => {
		const { institution: _, ...sinInstitucion } = validExternal;

		expect(v.safeParse(createExternalTrainerRule, sinInstitucion).success).toBe(
			false,
		);
	});

	test("aplica la política de contraseña, no la del login", () => {
		expect(
			v.safeParse(createExternalTrainerRule, {
				...validExternal,
				password: "1",
			}).success,
		).toBe(false);
	});

	test("normaliza el correo a minúsculas", () => {
		const parsed = v.parse(createExternalTrainerRule, {
			...validExternal,
			email: "  LUIS@Universidad.MX ",
		});

		expect(parsed.email).toBe("luis@universidad.mx");
	});

	// El CHECK `users_type_coherence` los prohíbe para una cuenta externa, así
	// que la regla no los ofrece.
	test("no declara dependencia ni número de empleado", () => {
		expect("dependency" in createExternalTrainerRule.entries).toBe(false);
		expect("employeeNumber" in createExternalTrainerRule.entries).toBe(false);
	});
});

describe("updateProfileRule — semblanza", () => {
	// Vaciar la semblanza tiene que llegar al repositorio como `null`: si se
	// descartara como ausencia, el diálogo diría "guardado" y la conservaría.
	test("acepta null para borrarla", () => {
		expect(v.parse(updateProfileRule, { bio: null })).toEqual({ bio: null });
	});
});

describe("campos del diálogo de perfil", () => {
	test("la especialidad es obligatoria y la semblanza no", () => {
		expect(v.safeParse(profileFieldsRule, { specialty: "" }).success).toBe(
			false,
		);
		expect(
			v.parse(profileFieldsRule, { specialty: "Protección civil" }),
		).toEqual({ specialty: "Protección civil" });
	});

	test("un externo además declara su institución", () => {
		expect(
			v.safeParse(externalProfileFieldsRule, { specialty: "Transparencia" })
				.success,
		).toBe(false);
		expect(
			v.safeParse(externalProfileFieldsRule, {
				specialty: "Transparencia",
				institution: "Universidad Autónoma",
			}).success,
		).toBe(true);
	});
});

describe("proyecciones", () => {
	const summary = {
		userDocumentId: "11111111-1111-4111-8111-111111111111",
		firstName: "Ana",
		lastName: "Ruiz",
		email: "ana@instituto.gob.mx",
		type: "INTERNAL",
		specialty: "Protección civil",
		institution: null,
		dependencyName: "Obras Públicas",
		archivedAt: null,
	};

	test("la fila del catálogo no lleva rol, estado de cuenta ni número de empleado", () => {
		expect(v.safeParse(trainerSummarySchema, summary).success).toBe(true);
		expect("role" in trainerSummarySchema.entries).toBe(false);
		expect("employeeNumber" in trainerSummarySchema.entries).toBe(false);
	});

	test("la ficha añade los campos que el catálogo no necesita", () => {
		const detail = {
			...summary,
			phone: null,
			bio: null,
			createdAt: new Date(0),
			updatedAt: new Date(0),
			coursesTaught: 0,
			averageRating: null,
		};

		expect(v.safeParse(trainerDetailSchema, detail).success).toBe(true);
	});
});
