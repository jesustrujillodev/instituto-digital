import * as v from "valibot";
import { atoms } from "@/shared/rules/atoms.rules";

/**
 * Contraseñas que están escritas en el repositorio: la del seed y el marcador
 * de `.env.example`. Una cuenta de producción con cualquiera de ellas la abre
 * quien lea el código.
 */
const PUBLIC_PASSWORDS = /^Password123!$|change-me/i;

/** Lo que el bootstrap de producción lee de sus variables. */
export const bootstrapSuperadminRule = v.object({
	email: atoms.email,
	password: v.pipe(
		atoms.newPassword,
		v.check(
			(password) => !PUBLIC_PASSWORDS.test(password),
			"La contraseña está escrita en el repositorio: elige otra.",
		),
	),
	employeeNumber: v.pipe(
		v.string("El número de empleado es obligatorio."),
		v.trim(),
		v.minLength(1, "El número de empleado es obligatorio."),
		v.maxLength(
			32,
			"El número de empleado no puede superar los 32 caracteres.",
		),
	),
	firstName: v.optional(v.pipe(v.string(), v.trim())),
	lastName: v.optional(v.pipe(v.string(), v.trim())),
});

export type BootstrapSuperadmin = v.InferOutput<typeof bootstrapSuperadminRule>;

/**
 * Qué hace el bootstrap con lo que ya hay en la base:
 *
 * - `skip`: ya hay un superadministrador activo. Correrlo otra vez no crea ni
 *   toca nada, así que se puede repetir sin miedo.
 * - `conflict`: el correo ya es de otra cuenta. No se la promueve en silencio.
 * - `create`: se crea el primero.
 */
export const bootstrapPlanOf = (state: {
	activeSuperadmins: number;
	emailTaken: boolean;
}): "skip" | "conflict" | "create" => {
	if (state.activeSuperadmins > 0) return "skip";
	if (state.emailTaken) return "conflict";
	return "create";
};
