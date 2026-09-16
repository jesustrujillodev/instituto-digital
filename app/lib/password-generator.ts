/**
 * Genera una contraseña segura que cumple con las validaciones estándar:
 * - Mínimo 8 caracteres
 * - Al menos una letra mayúscula
 * - Al menos un número
 * - Caracteres especiales opcionales
 */
export function generateSecurePassword(length = 12): string {
	const lowercase = "abcdefghijklmnopqrstuvwxyz";
	const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	const numbers = "0123456789";
	const special = "!@#$%&*-_=+";

	// Asegurar que la contraseña tenga al menos un carácter de cada tipo requerido
	const requiredChars = [
		uppercase[Math.floor(Math.random() * uppercase.length)],
		numbers[Math.floor(Math.random() * numbers.length)],
	];

	// Combinación de todos los caracteres
	const allChars = lowercase + uppercase + numbers + special;

	// Generar el resto de caracteres aleatorios
	const remainingLength = length - requiredChars.length;
	const randomChars = Array.from(
		{ length: remainingLength },
		() => allChars[Math.floor(Math.random() * allChars.length)],
	);

	// Combinar caracteres requeridos con aleatorios y mezclar
	const passwordArray = [...requiredChars, ...randomChars];

	// Mezclar usando Fisher-Yates shuffle
	for (let i = passwordArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
	}

	return passwordArray.join("");
}
