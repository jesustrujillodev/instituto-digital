import { describe, expect, test } from "vitest";
import { toDomain } from "../group.mapper";

const raw = {
	id: 5,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	dependencyId: 3,
	name: "Mandos medios",
	description: null,
	archivedAt: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	dependency: { name: "Obras Públicas" },
	_count: { members: 4 },
};

describe("toDomain", () => {
	// Ni el conteo ni el nombre de la dependencia son columnas: se aplanan en la
	// frontera para que ninguna capa de arriba conozca la forma del join.
	test("aplana el conteo de miembros y el nombre de la dependencia", () => {
		const group = toDomain(raw);

		expect(group.memberCount).toBe(4);
		expect(group.dependencyName).toBe("Obras Públicas");
	});

	test("sin miembros el conteo es cero, no undefined", () => {
		const { _count: _, ...sinConteo } = raw;

		expect(toDomain(sinConteo).memberCount).toBe(0);
	});
});
