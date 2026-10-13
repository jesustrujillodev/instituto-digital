import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	bootstrapPlanOf,
	bootstrapSuperadminRule,
} from "../user.bootstrap.rules";

const valid = {
	email: "Admin@Instituto.gob.mx",
	password: "Una-Clave-Propia-2026",
	employeeNumber: " ADMIN-0001 ",
};

describe("bootstrapSuperadminRule", () => {
	test("acepta una cuenta con contraseña propia y normaliza correo y número", () => {
		const result = v.safeParse(bootstrapSuperadminRule, valid);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.email).toBe("admin@instituto.gob.mx");
			expect(result.output.employeeNumber).toBe("ADMIN-0001");
		}
	});

	// Remediación V04: el seed dejaba en producción una contraseña pública.
	test("rechaza las contraseñas escritas en el repositorio", () => {
		for (const password of ["Password123!", "change-me-please-123"]) {
			expect(
				v.safeParse(bootstrapSuperadminRule, { ...valid, password }).success,
			).toBe(false);
		}
	});

	test("aplica la política de contraseñas y exige el número de empleado", () => {
		expect(
			v.safeParse(bootstrapSuperadminRule, { ...valid, password: "corta" })
				.success,
		).toBe(false);
		expect(
			v.safeParse(bootstrapSuperadminRule, { ...valid, employeeNumber: "  " })
				.success,
		).toBe(false);
	});
});

describe("bootstrapPlanOf", () => {
	test("con un superadministrador activo no hace nada", () => {
		expect(bootstrapPlanOf({ activeSuperadmins: 1, emailTaken: true })).toBe(
			"skip",
		);
	});

	test("no promueve en silencio una cuenta que ya existe", () => {
		expect(bootstrapPlanOf({ activeSuperadmins: 0, emailTaken: true })).toBe(
			"conflict",
		);
	});

	test("sin superadministrador ni correo ocupado, crea el primero", () => {
		expect(bootstrapPlanOf({ activeSuperadmins: 0, emailTaken: false })).toBe(
			"create",
		);
	});
});
