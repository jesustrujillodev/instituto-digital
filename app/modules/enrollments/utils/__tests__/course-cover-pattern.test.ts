import { describe, expect, test } from "vitest";
import { COVER_PATTERNS, coverDesignOf } from "../course-cover-pattern";

const idOf = (suffix: string) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa${suffix}`;

describe("coverDesignOf", () => {
	test("el mismo curso da siempre la misma placa", () => {
		// Determinismo obligado: el servidor y el cliente pintan el mismo nodo, y
		// una placa distinta en cada render es una discrepancia de hidratación.
		expect(coverDesignOf(idOf("0001"))).toEqual(coverDesignOf(idOf("0001")));
	});

	test("cursos distintos no comparten la misma placa", () => {
		const designs = Array.from({ length: 24 }, (_, index) =>
			JSON.stringify(coverDesignOf(idOf(String(index).padStart(4, "0")))),
		);

		expect(new Set(designs).size).toBeGreaterThan(8);
	});

	test("todo lo que devuelve es dibujable", () => {
		for (let index = 0; index < 200; index++) {
			const design = coverDesignOf(idOf(String(index).padStart(4, "0")));

			expect(COVER_PATTERNS).toContain(design.pattern);
			expect(design.scale).toBeGreaterThan(0);
			expect(Math.abs(design.rotation)).toBeLessThanOrEqual(90);
		}
	});

	test("las seis tramas se usan", () => {
		const used = new Set(
			Array.from(
				{ length: 400 },
				(_, index) =>
					coverDesignOf(idOf(String(index).padStart(4, "0"))).pattern,
			),
		);

		expect(used.size).toBe(COVER_PATTERNS.length);
	});

	test("una cadena vacía no revienta", () => {
		expect(COVER_PATTERNS).toContain(coverDesignOf("").pattern);
	});
});
