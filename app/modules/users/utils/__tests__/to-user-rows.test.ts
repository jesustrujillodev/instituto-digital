import { describe, expect, test } from "vitest";
import type { SafeUser } from "../../domain/user.types";
import { fullNameOf, initialsOf, toUserRows } from "../to-user-rows";

const userOf = (overrides: Partial<SafeUser> = {}): SafeUser => ({
	id: 1,
	documentId: "11111111-1111-4111-8111-111111111111",
	email: "ana@empresa.com",
	firstName: "Ana",
	lastName: "Ruiz",
	role: "USER",
	phone: null,
	photoUrl: null,
	type: "INTERNAL",
	employeeNumber: null,
	jobTitle: null,
	dependencyId: null,
	archivedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	...overrides,
});

describe("toUserRows", () => {
	// El `id` numérico se SUSTITUYE, no se añade: la PK interna de la base no
	// tiene por qué viajar al cliente, y la tabla necesita el identificador
	// público que ya usan las URLs y los actions.
	test("sustituye el id numérico por el documentId", () => {
		const [row] = toUserRows([userOf()]);

		expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
	});

	test("no deja rastro de la PK interna en la fila", () => {
		const [row] = toUserRows([userOf({ id: 42 })]);

		expect(Object.values(row)).not.toContain(42);
	});

	test("conserva el resto de campos del usuario", () => {
		const [row] = toUserRows([userOf({ email: "ana@empresa.com" })]);

		expect(row.email).toBe("ana@empresa.com");
		expect(row.firstName).toBe("Ana");
		expect(row.role).toBe("USER");
	});

	test("mapea la lista entera y respeta el orden", () => {
		const rows = toUserRows([
			userOf({ documentId: "a" }),
			userOf({ documentId: "b" }),
		]);

		expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
	});

	test("una lista vacía devuelve una lista vacía", () => {
		expect(toUserRows([])).toEqual([]);
	});
});

describe("fullNameOf", () => {
	test("une nombre y apellido", () => {
		expect(fullNameOf({ firstName: "Ana", lastName: "Ruiz" })).toBe("Ana Ruiz");
	});

	test("con un solo campo no deja espacios sueltos", () => {
		expect(fullNameOf({ firstName: "Ana", lastName: null })).toBe("Ana");
		expect(fullNameOf({ firstName: null, lastName: "Ruiz" })).toBe("Ruiz");
	});

	test("sin nombre registrado devuelve cadena vacía", () => {
		expect(fullNameOf({ firstName: null, lastName: null })).toBe("");
	});
});

describe("initialsOf", () => {
	test("toma la primera letra de nombre y apellido, en mayúscula", () => {
		expect(
			initialsOf({ firstName: "ana", lastName: "ruiz", email: "a@b.com" }),
		).toBe("AR");
	});

	test("con un solo campo devuelve una sola inicial", () => {
		expect(
			initialsOf({ firstName: "Ana", lastName: null, email: "a@b.com" }),
		).toBe("A");
	});

	// Una cuenta recién creada puede no tener nombre todavía; el avatar no puede
	// quedarse en blanco, así que cae al correo.
	test("sin nombre cae a la primera letra del correo", () => {
		expect(
			initialsOf({ firstName: null, lastName: null, email: "ana@empresa.com" }),
		).toBe("A");
	});

	test("sin nombre ni correo cae al interrogante", () => {
		expect(initialsOf({ firstName: null, lastName: null, email: "" })).toBe(
			"?",
		);
	});
});
