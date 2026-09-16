import { describe, expect, test } from "vitest";
import {
	validateAdminResetPassword,
	validateChangePassword,
	validateCreateUser,
	validateDeleteUser,
	validateFindUser,
	validateListUsers,
	validateUpdateUser,
} from "../user.validators";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

describe("validateCreateUser", () => {
	test("devuelve el dto parseado y normalizado", () => {
		const dto = validateCreateUser({
			email: "Ana@Empresa.com",
			password: "contrasena1",
			firstName: "  Ana  ",
			employeeNumber: "EMP-0007",
			dependency: "33333333-3333-4333-8333-333333333333",
		});

		expect(dto.email).toBe("ana@empresa.com");
		expect(dto.firstName).toBe("Ana");
	});

	test("lanza cuando la contraseña no cumple la política", () => {
		expect(() =>
			validateCreateUser({ email: "ana@empresa.com", password: "corta" }),
		).toThrow();
	});
});

describe("validateUpdateUser", () => {
	test("acepta una actualización parcial", () => {
		expect(validateUpdateUser({ firstName: "Ana" })).toEqual({
			firstName: "Ana",
		});
	});

	test("acepta un objeto vacío", () => {
		expect(validateUpdateUser({})).toEqual({});
	});

	test("lanza con un rol fuera de la tupla", () => {
		expect(() => validateUpdateUser({ role: "OWNER" })).toThrow();
	});
});

describe("validateChangePassword", () => {
	test("devuelve el dto cuando las contraseñas coinciden", () => {
		const dto = validateChangePassword({
			currentPassword: "anterior1",
			newPassword: "contrasena1",
			confirmPassword: "contrasena1",
		});

		expect(dto.newPassword).toBe("contrasena1");
	});

	test("lanza cuando las contraseñas no coinciden", () => {
		expect(() =>
			validateChangePassword({
				currentPassword: "anterior1",
				newPassword: "contrasena1",
				confirmPassword: "otra-cosa1",
			}),
		).toThrow();
	});

	// Es autoservicio: exige demostrar que se conoce la contraseña anterior.
	test("lanza si falta la contraseña actual", () => {
		expect(() =>
			validateChangePassword({
				newPassword: "contrasena1",
				confirmPassword: "contrasena1",
			}),
		).toThrow();
	});
});

describe("validateAdminResetPassword", () => {
	test("devuelve el dto sin exigir la contraseña actual", () => {
		const dto = validateAdminResetPassword({ newPassword: "contrasena1" });

		expect(dto.newPassword).toBe("contrasena1");
	});

	test("lanza cuando la contraseña no cumple la política", () => {
		expect(() =>
			validateAdminResetPassword({ newPassword: "corta" }),
		).toThrow();
	});
});

describe("validateFindUser / validateDeleteUser", () => {
	test("devuelven el documentId parseado", () => {
		expect(validateFindUser({ documentId: DOCUMENT_ID })).toEqual({
			documentId: DOCUMENT_ID,
		});
		expect(validateDeleteUser({ documentId: DOCUMENT_ID })).toEqual({
			documentId: DOCUMENT_ID,
		});
	});

	// El id llega de la URL y acaba en un `where`: si no fuera un uuid, el
	// repositorio recibiría lo que el usuario escribiera en la barra.
	test("lanzan cuando el id no es un uuid", () => {
		expect(() => validateFindUser({ documentId: "1" })).toThrow();
		expect(() => validateDeleteUser({ documentId: "../admin" })).toThrow();
	});
});

describe("validateListUsers", () => {
	test("devuelve los filtros parseados", () => {
		expect(validateListUsers({ status: "archived", page: 2 })).toEqual({
			status: "archived",
			page: 2,
		});
	});

	test("acepta un filtro vacío", () => {
		expect(validateListUsers({})).toEqual({});
	});

	test("lanza con una columna de orden fuera de la allowlist", () => {
		expect(() => validateListUsers({ sortBy: "password" })).toThrow();
	});
});
