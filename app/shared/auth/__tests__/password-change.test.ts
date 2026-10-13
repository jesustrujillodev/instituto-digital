import { describe, expect, test } from "vitest";
import { allowsPendingPasswordChange } from "../password-change";

describe("allowsPendingPasswordChange", () => {
	test("deja «Mi perfil», cerrar sesión y el proxy de storage", () => {
		for (const path of [
			"/dashboard/perfil",
			"/dashboard/perfil/",
			"/dashboard/perfil.data",
			"/cerrar-sesion",
			"/cerrar-sesiones",
			"/api/storage",
		]) {
			expect(allowsPendingPasswordChange(path)).toBe(true);
		}
	});

	test("cierra todo lo demás del dashboard", () => {
		for (const path of [
			"/dashboard",
			"/dashboard.data",
			"/dashboard/usuarios",
			"/dashboard/perfil-ajeno",
			"/dashboard/perfil/otra-cosa",
		]) {
			expect(allowsPendingPasswordChange(path)).toBe(false);
		}
	});
});
