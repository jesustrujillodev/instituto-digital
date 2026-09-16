import { afterEach, describe, expect, test, vi } from "vitest";
import { generateSecurePassword } from "../password-generator";

const ALPHABET =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-_=+";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("generateSecurePassword", () => {
	test("respects the requested length", () => {
		expect(generateSecurePassword(12)).toHaveLength(12);
		expect(generateSecurePassword(32)).toHaveLength(32);
		expect(generateSecurePassword()).toHaveLength(12);
	});

	// La garantía que justifica la función: lo generado tiene que pasar la misma
	// política que se le exige a una contraseña escrita a mano (atoms.newPassword
	// + mayúscula + dígito). Se repite porque el resto de caracteres es aleatorio.
	test("always contains at least one uppercase letter and one digit", () => {
		for (let i = 0; i < 100; i++) {
			const password = generateSecurePassword(8);

			expect(password).toMatch(/[A-Z]/);
			expect(password).toMatch(/[0-9]/);
		}
	});

	test("only emits characters from the declared alphabet", () => {
		const password = generateSecurePassword(64);

		for (const char of password) {
			expect(ALPHABET).toContain(char);
		}
	});

	// Con Math.random fijado el shuffle de Fisher-Yates es determinista: si alguien
	// reordena el algoritmo, este test lo nota.
	test("is deterministic once Math.random is pinned", () => {
		vi.spyOn(Math, "random").mockReturnValue(0);

		const first = generateSecurePassword(10);

		vi.spyOn(Math, "random").mockReturnValue(0);
		const second = generateSecurePassword(10);

		expect(second).toBe(first);
	});

	// Comportamiento real, no deseable: con length < 2 los dos caracteres
	// obligatorios ya superan lo pedido y `remainingLength` sale negativo. Se
	// documenta en vez de "arreglarse": ningún consumidor pide menos de 8, y la
	// alternativa (recortar) devolvería una contraseña sin mayúscula o sin dígito.
	test("never drops below the two guaranteed characters", () => {
		expect(generateSecurePassword(1)).toHaveLength(2);
		expect(generateSecurePassword(0)).toHaveLength(2);
	});

	test("two consecutive calls do not collide", () => {
		expect(generateSecurePassword(24)).not.toBe(generateSecurePassword(24));
	});
});
