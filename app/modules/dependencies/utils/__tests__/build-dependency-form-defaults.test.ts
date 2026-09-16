import { describe, expect, test } from "vitest";
import type { Dependency } from "../../domain/dependency.types";
import { buildDependencyFormDefaults } from "../build-dependency-form-defaults";

const dependencyOf = (overrides: Partial<Dependency> = {}): Dependency => ({
	id: 5,
	documentId: "11111111-1111-4111-8111-111111111111",
	name: "Obras Públicas",
	acronym: "SOP",
	archivedAt: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	...overrides,
});

describe("buildDependencyFormDefaults", () => {
	test("mapea una dependencia completa", () => {
		expect(buildDependencyFormDefaults(dependencyOf())).toEqual({
			name: "Obras Públicas",
			acronym: "SOP",
		});
	});

	// La columna admite null; el input, no. "" es la representación de "sin siglas"
	// en el formulario, y parseDependencyFormData la vuelve a convertir en ausencia.
	test("traduce el null de las siglas a cadena vacía", () => {
		expect(
			buildDependencyFormDefaults(dependencyOf({ acronym: null })).acronym,
		).toBe("");
	});

	// Ningún campo puede quedar undefined: react-hook-form nacería con inputs no
	// controlados y `isDirty` dejaría de ser fiable, que es lo que gobierna el
	// aviso de cambios sin guardar.
	test("sin dependencia devuelve todos los campos vacíos, nunca undefined", () => {
		const defaults = buildDependencyFormDefaults();

		expect(defaults).toEqual({ name: "", acronym: "" });
		for (const value of Object.values(defaults)) {
			expect(value).not.toBeUndefined();
		}
	});

	test("null se trata igual que la ausencia", () => {
		expect(buildDependencyFormDefaults(null)).toEqual({
			name: "",
			acronym: "",
		});
	});
});
