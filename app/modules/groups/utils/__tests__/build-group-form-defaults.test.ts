import { describe, expect, test } from "vitest";
import type { Group } from "../../domain/group.types";
import { buildGroupFormDefaults } from "../build-group-form-defaults";

const group: Group = {
	id: 5,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	name: "Mandos medios",
	description: null,
	memberCount: 0,
	archivedAt: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

describe("buildGroupFormDefaults", () => {
	// Ningún campo puede quedar undefined: react-hook-form nacería con inputs no
	// controlados y `isDirty` dejaría de ser fiable.
	test("las columnas nulas se representan como cadena vacía", () => {
		expect(buildGroupFormDefaults(group)).toEqual({
			name: "Mandos medios",
			description: "",
		});
	});

	test("sin grupo devuelve el formulario vacío", () => {
		expect(buildGroupFormDefaults(null)).toEqual({ name: "", description: "" });
	});
});
