import { describe, expect, test } from "vitest";
import { toDetail, toSummary } from "../trainer.mapper";

const rawSummary = {
	specialty: "Protección civil",
	institution: null,
	archivedAt: null,
	user: {
		documentId: "11111111-1111-4111-8111-111111111111",
		firstName: "Ana",
		lastName: "Ruiz",
		email: "ana@instituto.gob.mx",
		type: "INTERNAL",
		dependency: { name: "Obras Públicas" },
	},
};

const rawDetail = {
	...rawSummary,
	bio: "Veinte años en campo.",
	createdAt: new Date(0),
	updatedAt: new Date(0),
	user: { ...rawSummary.user, phone: "5512345678" },
};

describe("toSummary", () => {
	// Aplana el join en la frontera para que ninguna capa de arriba conozca su
	// forma.
	test("aplana la cuenta y su dependencia", () => {
		expect(toSummary(rawSummary)).toEqual({
			userDocumentId: "11111111-1111-4111-8111-111111111111",
			firstName: "Ana",
			lastName: "Ruiz",
			email: "ana@instituto.gob.mx",
			type: "INTERNAL",
			specialty: "Protección civil",
			institution: null,
			dependencyName: "Obras Públicas",
			archivedAt: null,
		});
	});

	// Un externo no tiene dependencia: la columna es nula y la proyección
	// también, no una cadena vacía que la UI tendría que distinguir.
	test("un externo sale sin dependencia", () => {
		const external = toSummary({
			...rawSummary,
			institution: "Universidad Autónoma",
			user: { ...rawSummary.user, type: "EXTERNAL", dependency: null },
		});

		expect(external.dependencyName).toBeNull();
		expect(external.institution).toBe("Universidad Autónoma");
	});
});

describe("toDetail", () => {
	test("añade teléfono, semblanza y los contadores pendientes", () => {
		const detail = toDetail(rawDetail);

		expect(detail.phone).toBe("5512345678");
		expect(detail.bio).toBe("Veinte años en campo.");
		expect(detail.coursesTaught).toBe(0);
		expect(detail.averageRating).toBeNull();
	});
});
