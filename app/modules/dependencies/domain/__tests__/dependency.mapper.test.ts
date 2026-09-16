import { describe, expect, test } from "vitest";
import { toDomain } from "../dependency.mapper";

const rawDependencyOf = (overrides: Record<string, unknown> = {}) => ({
	id: 5,
	documentId: "11111111-1111-4111-8111-111111111111",
	name: "Obras Públicas",
	acronym: "SOP",
	archivedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	...overrides,
});

describe("toDomain", () => {
	test("conserva los campos de la entidad", () => {
		const dependency = toDomain(rawDependencyOf());

		expect(dependency.id).toBe(5);
		expect(dependency.name).toBe("Obras Públicas");
		expect(dependency.acronym).toBe("SOP");
		expect(dependency.archivedAt).toBeNull();
	});

	test("acepta las columnas nullable en null", () => {
		const dependency = toDomain(rawDependencyOf({ acronym: null }));

		expect(dependency.acronym).toBeNull();
	});

	test("mapea una dependencia desactivada conservando la fecha", () => {
		const archivedAt = new Date("2026-02-01T00:00:00.000Z");

		expect(toDomain(rawDependencyOf({ archivedAt })).archivedAt).toEqual(
			archivedAt,
		);
	});

	// Se parsea contra el esquema, no se copia campo a campo: una columna que el
	// dominio no declara no llega a la respuesta aunque la base la traiga.
	test("descarta los campos que el esquema no declara", () => {
		const dependency = toDomain(
			rawDependencyOf({ internalNote: "no debe salir" }),
		);

		expect(dependency).not.toHaveProperty("internalNote");
	});

	// Es la red que justifica parsear en vez de castear: una fila corrupta se caza
	// al mapearla y no tres capas más arriba.
	test("lanza si la fila no cumple el esquema", () => {
		expect(() => toDomain(rawDependencyOf({ name: 42 }))).toThrow();
	});
});
