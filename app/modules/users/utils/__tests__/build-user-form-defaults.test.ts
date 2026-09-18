import { describe, expect, test } from "vitest";
import type { SafeUser } from "../../domain/user.types";
import { buildUserFormDefaults } from "../build-user-form-defaults";

const baseUser: SafeUser = {
	id: 1,
	documentId: "5a1f9f0c-1f4f-4f2a-9b6c-1f0a2b3c4d5e",
	email: "ana@empresa.com",
	firstName: "Ana",
	lastName: "García",
	role: "SUPERADMIN",
	phone: "5512345678",
	photoUrl: "/api/storage?key=profile-photos/ana.png",
	type: "INTERNAL",
	employeeNumber: "EMP-0007",
	jobTitle: "Coordinadora",
	dependencyId: 3,
	isTrainer: false,
	archivedAt: null,
	createdAt: new Date("2026-01-01T10:00:00Z"),
	updatedAt: new Date("2026-01-02T10:00:00Z"),
};

describe("buildUserFormDefaults", () => {
	test("mapea un usuario completo", () => {
		expect(buildUserFormDefaults(baseUser)).toEqual({
			firstName: "Ana",
			lastName: "García",
			email: "ana@empresa.com",
			phone: "5512345678",
			role: "SUPERADMIN",
			password: "",
			type: "INTERNAL",
			employeeNumber: "EMP-0007",
			jobTitle: "Coordinadora",
			// La dependencia no sale del usuario: SafeUser guarda el id interno, que no
			// viaja al cliente. Lo resuelve quien pinta el formulario.
			dependency: "",
		});
	});

	test("sin usuario devuelve el alta en blanco con rol por defecto", () => {
		expect(buildUserFormDefaults()).toEqual({
			firstName: "",
			lastName: "",
			email: "",
			phone: "",
			role: "USER",
			password: "",
			type: "INTERNAL",
			employeeNumber: "",
			jobTitle: "",
			dependency: "",
		});
	});

	test("convierte a cadena vacía los campos nullable de la base", () => {
		const defaults = buildUserFormDefaults({
			...baseUser,
			firstName: null,
			lastName: null,
			phone: null,
			photoUrl: null,
		});

		// Ningún campo puede quedar undefined: react-hook-form montaría inputs no
		// controlados y isDirty dejaría de ser fiable.
		expect(defaults.firstName).toBe("");
		expect(defaults.lastName).toBe("");
		expect(defaults.phone).toBe("");
		for (const value of Object.values(defaults)) {
			expect(value).toBeDefined();
		}
	});

	test("null se comporta igual que la ausencia de usuario", () => {
		expect(buildUserFormDefaults(null)).toEqual(buildUserFormDefaults());
	});
});
