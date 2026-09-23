import type { AppResponse } from "@/shared/response/response.types";

export const INTENT_FIELD = "intent";
export const PAYLOAD_FIELD = "payload";
export const FILE_FIELD = "file";

export const CERTIFICATE_INTENTS = {
	saveDraft: "save-draft",
	publish: "publish",
	discard: "discard",
	uploadSignature: "upload-signature",
} as const;

export type CertificateActionData = AppResponse<{
	signatureUrl: string;
} | null>;

export const certificatePath = (courseDocumentId: string) =>
	`/dashboard/cursos/${courseDocumentId}/certificado`;

export interface CertificateFormData {
	intent: FormDataEntryValue | null;
	/** El diseño llega como JSON en un campo; `null` si no se puede leer. */
	payload: unknown;
	file: File | null;
}

/** Del `FormData` a lo que valida el action; un JSON roto no se adivina. */
export const parseCertificateFormData = (
	formData: FormData,
): CertificateFormData => {
	const raw = formData.get(PAYLOAD_FIELD);
	let payload: unknown = null;
	if (typeof raw === "string") {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = null;
		}
	}

	const file = formData.get(FILE_FIELD);

	return {
		intent: formData.get(INTENT_FIELD),
		payload,
		file: file instanceof File && file.size > 0 ? file : null,
	};
};
