import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo del archivo, compartido por el formulario y el action. */
export const PHOTO_FIELD = "photo";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

/**
 * Intenciones que aceptan los actions del módulo.
 *
 * Viajan como un dato más del envío (y no como estado mutado antes de enviar):
 * así el comportamiento no depende del orden de los efectos y una validación
 * fallida no deja nada a medias.
 */
export const USER_INTENTS = {
	create: "create",
	update: "update",
	resetPassword: "reset-password",
	archive: "archive",
	unarchive: "unarchive",
	delete: "delete",
	changeDependency: "change-dependency",
	// Autoservicio, desde /dashboard/perfil. Separada del reseteo administrativo
	// porque exige la contraseña anterior.
	changePassword: "change-password",
} as const;

export type UserIntent = (typeof USER_INTENTS)[keyof typeof USER_INTENTS];

/**
 * Respuesta común de los actions del módulo: el envelope estándar sin dato de
 * vuelta —ninguna pantalla lo consume, revalidan el loader.
 *
 * Es una unión discriminada, así que `if (data.success)` estrecha el tipo y
 * `{ success: true, error }` no compila. `error.fieldErrors` cubre lo que el
 * cliente no puede saber por su cuenta (un email ya registrado) y se pinta junto
 * al input correspondiente, no en un toast.
 */
export type UserActionData = AppResponse<null>;

export interface ParsedUserFormData {
	/** Campos de texto listos para validar con valibot. */
	fields: Record<string, string>;
	/** Foto de perfil, si el usuario eligió una. */
	photo: File | null;
	/** Intención declarada por el formulario que envió. */
	intent: string | null;
}

/**
 * Separa el archivo del resto de campos de un envío multipart.
 *
 * Es imprescindible: `Object.fromEntries(formData)` mete el `File` como un campo
 * más y valibot lo rechazaría al validar el DTO. La versión genérica de la guía
 * (listas de claves JSON/booleanas) sería innecesaria aquí — este formulario no
 * envía arrays ni booleanos.
 *
 * Los campos vacíos se descartan: un `<input>` sin rellenar manda `""`, y para
 * los campos opcionales del dominio "" no es un valor válido sino su ausencia.
 */
export function parseUserFormData(formData: FormData): ParsedUserFormData {
	// Se lee con `get` y no dentro del bucle porque bun-types declara
	// `entries()` como `[string, string]` (perdiendo `File`), mientras que `get`
	// sí devuelve `File | string | null`.
	const photoEntry = formData.get(PHOTO_FIELD);
	// Tamaño 0 = el input de archivo se envió sin selección.
	const photo =
		photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;

	const fields: Record<string, string> = {};
	let intent: string | null = null;

	for (const [key, value] of formData.entries()) {
		if (key === PHOTO_FIELD) continue;
		// Guarda de ejecución: pese al tipo declarado, un envío multipart puede
		// traer File en cualquier clave.
		if (typeof value !== "string") continue;

		if (key === INTENT_FIELD) {
			intent = value;
			continue;
		}

		if (value === "") continue;

		fields[key] = value;
	}

	return { fields, photo, intent };
}
