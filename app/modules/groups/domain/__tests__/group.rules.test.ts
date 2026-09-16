import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	addMembersRule,
	createGroupRule,
	groupSchema,
	listGroupsRule,
	removeMemberRule,
	updateGroupRule,
} from "../group.rules";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("createGroupRule", () => {
	// El nombre lo vigila el índice único parcial: recortarlo antes de validar
	// evita que "Mandos" con y sin espacio sean dos grupos que la base acepta por
	// separado.
	test("recorta el nombre antes de validarlo", () => {
		expect(v.parse(createGroupRule, { name: "  Mandos medios  " }).name).toBe(
			"Mandos medios",
		);
	});

	test("un nombre demasiado corto no pasa", () => {
		expect(v.safeParse(createGroupRule, { name: "ab" }).success).toBe(false);
	});

	// La pone el alcance de quien crea, no el formulario: declararla aquí
	// permitiría crear un grupo en otra dependencia.
	test("no declara dependencia", () => {
		expect("dependencyId" in createGroupRule.entries).toBe(false);
	});
});

describe("updateGroupRule", () => {
	test("todos los campos son opcionales: es una edición parcial", () => {
		expect(v.safeParse(updateGroupRule, {}).success).toBe(true);
	});
});

describe("addMembersRule", () => {
	test("acepta varios identificadores en un solo envío", () => {
		const parsed = v.parse(addMembersRule, {
			documentId: UUID_A,
			userDocumentIds: [UUID_A, UUID_B],
		});

		expect(parsed.userDocumentIds).toHaveLength(2);
	});

	// Un alta vacía no es un alta: dejarla pasar respondería "miembros
	// agregados" sin haber agregado a nadie.
	test("un lote vacío no pasa", () => {
		expect(
			v.safeParse(addMembersRule, { documentId: UUID_A, userDocumentIds: [] })
				.success,
		).toBe(false);
	});

	test("un identificador que no es uuid tumba el lote", () => {
		expect(
			v.safeParse(addMembersRule, {
				documentId: UUID_A,
				userDocumentIds: [UUID_A, "no-es-uuid"],
			}).success,
		).toBe(false);
	});
});

describe("removeMemberRule", () => {
	test("exige los dos identificadores públicos", () => {
		expect(v.safeParse(removeMemberRule, { documentId: UUID_A }).success).toBe(
			false,
		);
	});
});

describe("listGroupsRule", () => {
	test("un campo de orden fuera de la allowlist no pasa", () => {
		expect(
			v.safeParse(listGroupsRule, { sortBy: "dependencyId" }).success,
		).toBe(false);
	});
});

describe("groupSchema", () => {
	test("acepta la fila ya aplanada", () => {
		expect(
			v.safeParse(groupSchema, {
				id: 5,
				documentId: UUID_A,
				dependencyId: 3,
				dependencyName: "Obras Públicas",
				name: "Mandos medios",
				description: null,
				memberCount: 0,
				archivedAt: null,
				createdAt: new Date(0),
				updatedAt: new Date(0),
			}).success,
		).toBe(true);
	});
});
