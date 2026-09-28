import { describe, expect, test } from "vitest";
import { toDetail, toStatsByUser, toSummary } from "../trainer.mapper";

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
	test("añade teléfono, semblanza y las estadísticas calculadas", () => {
		const detail = toDetail(rawDetail, {
			coursesTaught: 3,
			averageRating: 4.5,
		});

		expect(detail.phone).toBe("5512345678");
		expect(detail.bio).toBe("Veinte años en campo.");
		expect(detail.coursesTaught).toBe(3);
		expect(detail.averageRating).toBe(4.5);
	});

	test("sin valoraciones, el promedio es null y no cero", () => {
		const detail = toDetail(rawDetail, {
			coursesTaught: 0,
			averageRating: null,
		});

		expect(detail.averageRating).toBeNull();
	});
});

describe("toStatsByUser", () => {
	test("cuenta cursos y promedia todas las valoraciones, no los promedios", () => {
		const stats = toStatsByUser(
			[
				{ userId: 1, courseId: 10 },
				{ userId: 1, courseId: 11 },
			],
			[
				{ courseId: 10, scoreSum: 20, count: 4 },
				{ courseId: 11, scoreSum: 4, count: 2 },
			],
		);

		// (20 + 4) / (4 + 2) = 4, y no la media de 5 y 2.
		expect(stats.get(1)).toEqual({ coursesTaught: 2, averageRating: 4 });
	});

	test("un curso compartido cuenta para cada uno de sus capacitadores", () => {
		const stats = toStatsByUser(
			[
				{ userId: 1, courseId: 10 },
				{ userId: 2, courseId: 10 },
			],
			[{ courseId: 10, scoreSum: 9, count: 2 }],
		);

		expect(stats.get(1)?.averageRating).toBe(4.5);
		expect(stats.get(2)?.averageRating).toBe(4.5);
	});

	test("sin valoraciones el promedio es null y no cero", () => {
		const stats = toStatsByUser([{ userId: 1, courseId: 10 }], []);

		expect(stats.get(1)).toEqual({ coursesTaught: 1, averageRating: null });
	});

	test("quien no impartió ningún curso finalizado no aparece", () => {
		expect(toStatsByUser([], []).size).toBe(0);
	});
});
