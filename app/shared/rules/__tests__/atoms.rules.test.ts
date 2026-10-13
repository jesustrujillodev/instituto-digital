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

	// 254 es el máximo de una dirección (RFC 5321). Sin tope, el login aceptaba un
	// correo de 1 MB y el limitador lo guardaba como clave durante toda la ventana.
	test("accepts up to 254 characters and rejects more", () => {
		const of = (lastLabel: number) =>
			`${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(lastLabel)}.mx`;

		expect(of(58)).toHaveLength(254);
		expect(v.safeParse(atoms.email, of(58)).success).toBe(true);

		const tooLong = v.safeParse(atoms.email, of(59));
		expect(tooLong.success).toBe(false);
		expect(tooLong.issues?.[0].message).toBe(
			"El correo electrónico no puede exceder los 254 caracteres.",
		);
	});

	test("rejects a 1 MB address", () => {
		expect(
			v.safeParse(atoms.email, `${"a".repeat(1024 * 1024)}@empresa.com`)
				.success,
		).toBe(false);
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
	test("caps at bcrypt's 72-byte limit", () => {
		expect(v.safeParse(atoms.password, "a".repeat(72)).success).toBe(true);
		expect(v.safeParse(atoms.password, "a".repeat(73)).success).toBe(false);
	});

	// Remediación (Fase C): 37 «ñ» son 37 caracteres pero 74 bytes.
	test("counts UTF-8 bytes, not characters", () => {
		expect(v.safeParse(atoms.password, "ñ".repeat(36)).success).toBe(true);
		expect(v.safeParse(atoms.password, "ñ".repeat(37)).success).toBe(false);
	});
});

describe("atoms.newPassword", () => {
	test("applies the 8-character policy", () => {
		expect(v.safeParse(atoms.newPassword, "12345678").success).toBe(true);
		expect(v.safeParse(atoms.newPassword, "1234567").success).toBe(false);
	});

	test("caps at bcrypt's 72-byte limit", () => {
		expect(v.safeParse(atoms.newPassword, "a".repeat(73)).success).toBe(false);
	});

	// Remediación (Fase C): bcrypt recortaba en silencio lo que pasara de 72
	// bytes, así que una contraseña con acentos valía menos de lo que parecía.
	test("rejects 72 characters that are more than 72 bytes", () => {
		expect(v.safeParse(atoms.newPassword, `Aa1${"é".repeat(35)}`).success).toBe(
			false,
		);
		expect(v.safeParse(atoms.newPassword, `Aa1${"é".repeat(34)}`).success).toBe(
			true,
		);
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
