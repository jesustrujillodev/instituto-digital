const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SPECIAL = "!@#$%&*-_=+";
const ALL_CHARS = LOWERCASE + UPPERCASE + NUMBERS + SPECIAL;

const UINT32_RANGE = 2 ** 32;

/**
 * Un entero uniforme en `[0, n)` del generador criptográfico. Descarta lo que
 * cae por encima del último múltiplo de `n`: con `% n` a secas, los primeros
 * valores saldrían un poco más que los demás.
 */
const randomIndex = (n: number): number => {
	const limit = UINT32_RANGE - (UINT32_RANGE % n);
	const buffer = new Uint32Array(1);
	do {
		crypto.getRandomValues(buffer);
	} while (buffer[0] >= limit);
	return buffer[0] % n;
};

const pick = (chars: string) => chars[randomIndex(chars.length)];

/**
 * Genera una contraseña con al menos una mayúscula y un número, que es lo que
 * exige la política (`atoms.newPassword`). Usa `crypto.getRandomValues`: es la
 * que se entrega a una cuenta nueva o en un restablecimiento, y no puede salir
 * de un generador predecible como `Math.random`.
 */
export function generateSecurePassword(length = 12): string {
	const requiredChars = [pick(UPPERCASE), pick(NUMBERS)];
	const randomChars = Array.from(
		{ length: length - requiredChars.length },
		() => pick(ALL_CHARS),
	);
	const passwordArray = [...requiredChars, ...randomChars];

	// Fisher-Yates: los dos obligatorios no quedan siempre al principio.
	for (let i = passwordArray.length - 1; i > 0; i--) {
		const j = randomIndex(i + 1);
		[passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
	}

	return passwordArray.join("");
}
