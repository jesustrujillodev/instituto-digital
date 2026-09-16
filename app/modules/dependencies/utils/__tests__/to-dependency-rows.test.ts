import { describe, expect, test } from "vitest";
import type { Dependency } from "../../domain/dependency.types";
import { labelOf, toDependencyRows } from "../to-dependency-rows";

const dependencyOf = (overrides: Partial<Dependency> = {}): Dependency => ({
	id: 5,
	documentId: "11111111-1111-4111-8111-111111111111",
	name: "Obras Públicas",
	acronym: "SOP",
	archivedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	...overrides,
});

describe("toDependencyRows", () => {
	// El id numérico se SUSTITUYE, no se añade: la PK interna no tiene por qué
	// viajar al cliente, y DataTable necesita un id de tipo string.
	test("usa el documentId como id de la fila", () => {
		const [row] = toDependencyRows([dependencyOf()]);

		expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
	});

	test("no expone la PK interna", () => {
		const [row] = toDependencyRows([dependencyOf()]);

		expect(JSON.stringify(row)).not.toContain('"id":5');
	});

	test("conserva el resto de campos", () => {
		const [row] = toDependencyRows([dependencyOf()]);

		expect(row.name).toBe("Obras Públicas");
		expect(row.acronym).toBe("SOP");
		expect(row.archivedAt).toBeNull();
	});

	test("mapea la lista completa", () => {
		const rows = toDependencyRows([
			dependencyOf(),
			dependencyOf({
				id: 6,
				documentId: "22222222-2222-4222-8222-222222222222",
			}),
		]);

		expect(rows).toHaveLength(2);
		expect(rows[1].id).toBe("22222222-2222-4222-8222-222222222222");
	});

	test("una lista vacía devuelve una lista vacía", () => {
		expect(toDependencyRows([])).toEqual([]);
	});
});

describe("labelOf", () => {
	test("añade las siglas entre paréntesis", () => {
		expect(labelOf({ name: "Obras Públicas", acronym: "SOP" })).toBe(
			"Obras Públicas (SOP)",
		);
	});

	// Sin siglas no se pinta un paréntesis vacío: no todas las dependencias tienen.
	test("sin siglas devuelve solo el nombre", () => {
		expect(labelOf({ name: "Obras Públicas", acronym: null })).toBe(
			"Obras Públicas",
		);
	});
});
