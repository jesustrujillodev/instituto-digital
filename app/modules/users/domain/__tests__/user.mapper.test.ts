import { describe, expect, test } from "vitest";
import { toDomain } from "../user.mapper";

const rawUserOf = (overrides: Record<string, unknown> = {}) => ({
	id: 7,
	documentId: "11111111-1111-4111-8111-111111111111",
	email: "ana@empresa.com",
	firstName: "Ana",
	lastName: "Ruiz",
	password: "$2a$12$hashquenodebesalir",
	role: "USER",
	phone: null,
	photoUrl: null,
	type: "INTERNAL",
	employeeNumber: "EMP-0007",
	jobTitle: "Coordinadora",
	dependencyId: 3,
	archivedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	...overrides,
});

describe("toDomain", () => {
	// La razón de existir del mapper: la fila cruda TRAE el hash de la contraseña,
	// y todo lo que salga de aquí acaba serializado en el HTML o en una respuesta.
	test("elimina la contraseña de la fila cruda", () => {
		const user = toDomain(rawUserOf());

		expect(user).not.toHaveProperty("password");
		expect(JSON.stringify(user)).not.toContain("$2a$12$");
	});

	test("conserva el resto de campos", () => {
		const user = toDomain(rawUserOf());

		expect(user.id).toBe(7);
		expect(user.email).toBe("ana@empresa.com");
		expect(user.firstName).toBe("Ana");
		expect(user.role).toBe("USER");
	});

	test("acepta las columnas nullable en null", () => {
		const user = toDomain(
			rawUserOf({
				firstName: null,
				lastName: null,
				phone: null,
				photoUrl: null,
			}),
		);

		expect(user.firstName).toBeNull();
		expect(user.photoUrl).toBeNull();
	});

	test("mapea una cuenta archivada conservando la fecha", () => {
		const archivedAt = new Date("2026-06-01T00:00:00.000Z");

		expect(toDomain(rawUserOf({ archivedAt })).archivedAt).toEqual(archivedAt);
	});

	// Se parsea contra `safeUserSchema` —el mismo de user.rules, no una copia—
	// para que añadir un campo al esquema no exija recordar tocar el mapper. El
	// precio es que una fila incompleta falla aquí, que es donde se diagnostica.
	test("lanza cuando la fila no cumple el esquema", () => {
		const { email: _, ...sinEmail } = rawUserOf();

		expect(() => toDomain(sinEmail)).toThrow();
	});

	test("lanza cuando una fecha llega como string ISO en vez de Date", () => {
		expect(() =>
			toDomain(rawUserOf({ createdAt: "2026-01-01T00:00:00.000Z" })),
		).toThrow();
	});

	// Un campo de más en la fila no se cuela: el esquema define exactamente qué
	// sale, así que una columna nueva no viaja hasta declararse.
	test("descarta los campos que el esquema no declara", () => {
		const user = toDomain(rawUserOf({ columnaInterna: "secreto" }));

		expect(user).not.toHaveProperty("columnaInterna");
	});
});
