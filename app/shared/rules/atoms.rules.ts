import * as v from "valibot";

// Recorta ANTES de validar el formato: el correo llega pegado desde un gestor de
// contraseñas o un cliente de correo con espacios alrededor, y `v.email()` los
// rechazaría. Los espacios internos siguen fallando. El tope va antes del formato
// para no pasar la expresión regular por una cadena de megas.
const email = v.pipe(
	v.string("El correo electrónico es obligatorio."),
	v.trim(),
	v.maxLength(
		254,
		"El correo electrónico no puede exceder los 254 caracteres.",
	),
	v.email("Escribe un correo electrónico válido."),
	v.transform((val) => val.toLowerCase()),
);

// bcrypt solo mira los primeros 72 BYTES en UTF-8, no 72 caracteres: una "ñ" o
// una vocal acentuada ocupan 2 y un emoji 4. Contar caracteres dejaba pasar
// contraseñas que bcrypt recorta en silencio.
const BCRYPT_MAX_BYTES = 72;

// Para LOGIN: solo "no vacía" — la política no se revela en el login. El tope
// evita procesar entradas gigantes y que `password + basura` autentique por
// truncamiento.
const password = v.pipe(
	v.string("La contraseña es obligatoria."),
	v.minLength(1, "La contraseña es obligatoria."),
	v.maxBytes(BCRYPT_MAX_BYTES, "La contraseña excede la longitud máxima."),
);

// Para CREAR/CAMBIAR contraseña: aquí sí aplica la política.
const newPassword = v.pipe(
	v.string("La contraseña es obligatoria."),
	v.minLength(8, "La contraseña debe tener al menos 8 caracteres."),
	v.maxBytes(
		BCRYPT_MAX_BYTES,
		"La contraseña es demasiado larga: admite hasta 72 caracteres, y los acentos, la ñ y los símbolos especiales cuentan por más de uno.",
	),
);

// ── Roles ──────────────────────────────────────────────────────────────────────
// ÚNICO punto de variación de roles: se edita esta tupla y el resto del sistema
// (payload JWT, reglas de usuario, requireRole, navegación) la hereda. No
// declarar picklists de rol en ningún otro lugar.
//
// `USER` es el rol base y hace además de participante del instituto:
// reutilizarlo en vez de introducir `PARTICIPANT` evita un backfill y es el
// valor por defecto que ya tiene la columna.
//
// El orden es el de la jerarquía, de mayor a menor: selectores y filtros lo
// muestran tal cual. La jerarquía como regla NO vive aquí (ver el JSDoc de
// `hasRole`): está en modules/users/domain/user.access.rules.ts.
export const ROLES = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
	"USER",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Único predicado de rol compartido por el servidor (requireRole), la config de
 * navegación y los guards de UI (RoleGuard).
 *
 * Su valor no es la lógica —es un `includes`— sino el vocabulario: al tipar
 * `allowed` como `readonly Role[]`, un rol inexistente falla en compilación en
 * todos los puntos de uso a la vez.
 *
 * Intencionadamente NO se añade jerarquía (isAdmin / canManageRole): nombrar un
 * rol concreto en código compartido rompe el contrato de "editar solo esta
 * tupla" para los proyectos derivados. Cuando exista CRUD de usuarios con una
 * jerarquía real, vivirá en modules/users/domain, no aquí.
 */
export function hasRole(role: Role, allowed: readonly Role[]): boolean {
	return allowed.includes(role);
}

const role = v.picklist(ROLES, "El rol seleccionado no es válido.");

export const atoms = {
	email,
	password,
	newPassword,
	role,
} as const;
