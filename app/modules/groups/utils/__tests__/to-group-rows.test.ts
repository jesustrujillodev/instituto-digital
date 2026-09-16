import { describe, expect, test } from "vitest";
import type { Group, GroupMemberEntry } from "../../domain/group.types";
import { memberNameOf, toGroupRows } from "../to-group-rows";

const group: Group = {
	id: 5,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	name: "Mandos medios",
	description: null,
	memberCount: 4,
	archivedAt: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

const memberOf = (
	overrides: Partial<GroupMemberEntry> = {},
): GroupMemberEntry => ({
	userDocumentId: "11111111-1111-4111-8111-111111111111",
	firstName: "Ana",
	lastName: "Ruiz",
	email: "ana@instituto.gob.mx",
	dependencyName: "Obras Públicas",
	addedAt: new Date(0),
	...overrides,
});

describe("toGroupRows", () => {
	// El `id` numérico se SUSTITUYE, no se añade: la PK interna no tiene por qué
	// viajar al cliente.
	test("la fila se identifica por el documentId", () => {
		const [row] = toGroupRows([group]);

		expect(row.id).toBe(group.documentId);
		expect(typeof row.id).toBe("string");
	});
});

describe("memberNameOf", () => {
	test("cae al correo cuando la cuenta no tiene nombre capturado", () => {
		expect(memberNameOf(memberOf({ firstName: null, lastName: null }))).toBe(
			"ana@instituto.gob.mx",
		);
	});

	test("compone nombre y apellidos", () => {
		expect(memberNameOf(memberOf())).toBe("Ana Ruiz");
	});
});
