import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

export const GROUP_INTENTS = {
	create: "create",
	update: "update",
	archive: "archive",
	unarchive: "unarchive",
	addMembers: "add-members",
	removeMember: "remove-member",
} as const;

export type GroupIntent = (typeof GROUP_INTENTS)[keyof typeof GROUP_INTENTS];

/** Respuesta común de los actions del módulo: envelope estándar sin dato. */
export type GroupActionData = AppResponse<null>;

export interface ParsedGroupFormData {
	fields: Record<string, string>;
	/** Claves repetidas del envío, para el alta de miembros en lote. */
	lists: Record<string, string[]>;
	intent: string | null;
}

/**
 * Campos de texto, listas e intención de un envío del módulo.
 *
 * A diferencia del resto de módulos aquí SÍ hacen falta las claves repetidas:
 * el alta de miembros manda varios `userDocumentIds` en el mismo envío, y
 * quedarse con el último dejaría el grupo con un solo miembro sin avisar.
 */
export function parseGroupFormData(formData: FormData): ParsedGroupFormData {
	const fields: Record<string, string> = {};
	const lists: Record<string, string[]> = {};
	let intent: string | null = null;

	for (const [key, value] of formData.entries()) {
		// Guarda de ejecución: pese al tipo declarado, un envío multipart puede
		// traer File en cualquier clave.
		if (typeof value !== "string") continue;

		if (key === INTENT_FIELD) {
			intent = value;
			continue;
		}

		if (value === "") continue;

		const list = lists[key] ?? [];
		list.push(value);
		lists[key] = list;
		fields[key] = value;
	}

	return { fields, lists, intent };
}
