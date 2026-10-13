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

	// Remediación (Fase C): Math.random no es un generador criptográfico.
	test("no usa Math.random, sino el generador criptográfico", () => {
		const mathRandom = vi.spyOn(Math, "random");
		const getRandomValues = vi.spyOn(crypto, "getRandomValues");

		generateSecurePassword(16);

		expect(mathRandom).not.toHaveBeenCalled();
		expect(getRandomValues).toHaveBeenCalled();
	});

	// Con el generador fijado el shuffle de Fisher-Yates es determinista: si
	// alguien reordena el algoritmo, este test lo nota.
	test("is deterministic once the random source is pinned", () => {
		const pinned = <T extends ArrayBufferView | null>(array: T): T => {
			if (array instanceof Uint32Array) array.fill(0);
			return array;
		};
		vi.spyOn(crypto, "getRandomValues").mockImplementation(pinned);

		expect(generateSecurePassword(10)).toBe(generateSecurePassword(10));
	});

	// Sin descartar, `% n` favorece los primeros valores; lo que cae por
	// encima del último múltiplo se vuelve a sortear.
	test("vuelve a sortear lo que cae fuera del último múltiplo", () => {
		const draws = [2 ** 32 - 1, 5];
		const getRandomValues = vi
			.spyOn(crypto, "getRandomValues")
			.mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
				if (array instanceof Uint32Array) array[0] = draws.shift() ?? 0;
				return array;
			});

		generateSecurePassword(2);

		expect(getRandomValues.mock.calls.length).toBeGreaterThanOrEqual(3);
		expect(draws).toEqual([]);
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
