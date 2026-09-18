import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { atoms, hasRole, ROLES } from "../atoms.rules";

describe("ROLES", () => {
	// Único punto de variación de roles: si esta tupla crece, el payload del JWT,
	// requireRole y la navegación lo heredan sin tocarse.
	test("is the single source of truth for the role tuple", () => {
		expect(ROLES).toEqual([
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
			"USER",
		]);
	});

	// El rol de la plantilla se retiró: un token o una fila que lo traiga ya no
	// valida, en vez de colarse con un alcance que nadie documenta.
	test("no acepta el ADMIN heredado de la plantilla", () => {
		expect(v.safeParse(atoms.role, "ADMIN").success).toBe(false);
	});
});

describe("hasRole", () => {
	test("returns true when the role is in the allowed list", () => {
		expect(hasRole("SUPERADMIN", ["USER", "SUPERADMIN"])).toBe(true);
	});

	test("returns false when the role is not in the allowed list", () => {
		expect(hasRole("USER", ["SUPERADMIN"])).toBe(false);
	});

	test("returns false for an empty allowed list", () => {
		expect(hasRole("SUPERADMIN", [])).toBe(false);
	});
});

describe("atoms.email", () => {
	// Normaliza al parsear: la búsqueda por correo y el índice único de la base
	// verían "Ana@Empresa.com" y "ana@empresa.com" como dos cuentas distintas.
	test("lowercases the parsed value", () => {
		expect(v.parse(atoms.email, "Ana@Empresa.COM")).toBe("ana@empresa.com");
	});

	// Se recorta antes de validar: el correo llega pegado desde el gestor de
	// contraseñas con espacios alrededor y, como el login responde "Credenciales
	// inválidas" a cualquier fallo de validación, rechazarlo dejaría al usuario sin
	// forma de saber que lo único que sobra es un espacio.
	test("trims surrounding whitespace before validating", () => {
		expect(v.parse(atoms.email, " ana@empresa.com ")).toBe("ana@empresa.com");
	});

	// El trim es solo exterior: un espacio interno no es un correo válido.
	test("still rejects internal whitespace", () => {
		expect(v.safeParse(atoms.email, "ana @empresa.com").success).toBe(false);
	});

	test("rejects a malformed address", () => {
		expect(v.safeParse(atoms.email, "ana").success).toBe(false);
		expect(v.safeParse(atoms.email, "").success).toBe(false);
	});
});

describe("atoms.password", () => {
	// En el LOGIN la política no se revela: solo se exige que no venga vacía. Pedir
	// aquí los 8 caracteres le diría al atacante qué contraseñas ni vale la pena
	// probar.
	test("only requires a non-empty string", () => {
		expect(v.safeParse(atoms.password, "x").success).toBe(true);
		expect(v.safeParse(atoms.password, "").success).toBe(false);
	});

	// El cap de 72 es el límite efectivo de bcrypt en bytes. Sin él, `password +
	// basura` autenticaría por truncamiento.
	test("caps at bcrypt's 72-character limit", () => {
		expect(v.safeParse(atoms.password, "a".repeat(72)).success).toBe(true);
		expect(v.safeParse(atoms.password, "a".repeat(73)).success).toBe(false);
	});
});

describe("atoms.newPassword", () => {
	test("applies the 8-character policy", () => {
		expect(v.safeParse(atoms.newPassword, "12345678").success).toBe(true);
		expect(v.safeParse(atoms.newPassword, "1234567").success).toBe(false);
	});

	test("caps at bcrypt's 72-character limit", () => {
		expect(v.safeParse(atoms.newPassword, "a".repeat(73)).success).toBe(false);
	});
});

describe("atoms.role", () => {
	test("accepts every role of the shared tuple", () => {
		for (const role of ROLES) {
			expect(v.safeParse(atoms.role, role).success).toBe(true);
		}
	});

	// Es lo que impide firmar un access token con un rol inventado: el payload se
	// valida contra este mismo picklist antes de acuñarse.
	test("rejects a role outside the tuple", () => {
		expect(v.safeParse(atoms.role, "OWNER").success).toBe(false);
		expect(v.safeParse(atoms.role, "admin").success).toBe(false);
	});
});
