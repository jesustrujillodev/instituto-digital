import type { AppResponse } from "@/shared/response/response.types";
import type {
	CloudDeleteResult,
	DeleteImpact,
	OrphanScan,
	ZipManifest,
} from "../domain/cloud.types";

/** Campo del envío con la intención de la mutación. */
export const INTENT_FIELD = "intent";

export const CLOUD_INTENTS = {
	download: "download",
	zipManifest: "zip-manifest",
	deletePreview: "delete-preview",
	delete: "delete",
	scanOrphans: "scan-orphans",
} as const;

export type CloudIntent = (typeof CLOUD_INTENTS)[keyof typeof CLOUD_INTENTS];

/**
 * Campos de la selección. Se repiten una vez por elemento (`key=a&key=b`) en
 * vez de viajar como JSON: es lo que produce un `FormData` sin serializar nada.
 */
export const SELECTION_FIELDS = {
	key: "key",
	prefix: "prefix",
	path: "path",
} as const;

/** Lee la selección cruda del envío; la valida `validateCloudSelection`. */
export const readSelection = (formData: FormData) => ({
	keys: formData.getAll(SELECTION_FIELDS.key).map(String),
	prefixes: formData.getAll(SELECTION_FIELDS.prefix).map(String),
});

/** Arma el envío de una selección para `fetcher.submit`. */
export const toSelectionFormData = (
	intent: CloudIntent,
	selection: { keys: readonly string[]; prefixes: readonly string[] },
): FormData => {
	const body = new FormData();
	body.set(INTENT_FIELD, intent);
	for (const key of selection.keys) body.append(SELECTION_FIELDS.key, key);
	for (const prefix of selection.prefixes) {
		body.append(SELECTION_FIELDS.prefix, prefix);
	}
	return body;
};

/**
 * Lo que devuelve cada intent. Lleva la intención dentro para que la pantalla
 * distinga respuestas de fetchers distintos sin comparar mensajes.
 */
export type CloudActionPayload =
	| { intent: typeof CLOUD_INTENTS.download; url: string }
	| { intent: typeof CLOUD_INTENTS.zipManifest; manifest: ZipManifest }
	| { intent: typeof CLOUD_INTENTS.deletePreview; impact: DeleteImpact }
	| { intent: typeof CLOUD_INTENTS.delete; result: CloudDeleteResult }
	| { intent: typeof CLOUD_INTENTS.scanOrphans; scan: OrphanScan };

export type CloudActionData = AppResponse<CloudActionPayload>;
