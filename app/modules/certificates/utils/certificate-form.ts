import type { AppResponse } from "@/shared/response/response.types";
import type {
	CertificateDesignV2,
	CertificateTemplateView,
	UploadedBackground,
	UploadedImage,
} from "../domain/certificate.types";

export const INTENT_FIELD = "intent";
export const PAYLOAD_FIELD = "payload";
export const FILE_FIELD = "file";
export const PDF_FIELD = "pdf";
export const RASTER_FIELD = "raster";
export const RASTER_DPI_FIELD = "rasterDpi";

export const CERTIFICATE_INTENTS = {
	saveDraft: "save-draft",
	publish: "publish",
	discard: "discard",
	uploadImage: "upload-image",
	uploadBackground: "upload-background",
	saveDelivery: "save-delivery",
	applyTemplate: "apply-template",
	saveAsTemplate: "save-as-template",
} as const;

export type CertificateActionData = AppResponse<
	| UploadedImage
	| UploadedBackground
	| { applied: CertificateDesignV2 }
	| CertificateTemplateView
	| null
>;

export const certificatePath = (courseDocumentId: string) =>
	`/dashboard/capacitaciones/${courseDocumentId}/certificado`;

export const certificateEditorPath = (courseDocumentId: string) =>
	`${certificatePath(courseDocumentId)}/editor`;

export interface CertificateFormData {
	intent: FormDataEntryValue | null;
	/** El diseño llega como JSON en un campo; `null` si no se puede leer. */
	payload: unknown;
	file: File | null;
	pdf: File | null;
	raster: File | null;
	rasterDpi: number | null;
}

const fileOf = (formData: FormData, field: string) => {
	const value = formData.get(field);
	return value instanceof File && value.size > 0 ? value : null;
};

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

	const dpi = Number(formData.get(RASTER_DPI_FIELD));

	return {
		intent: formData.get(INTENT_FIELD),
		payload,
		file: fileOf(formData, FILE_FIELD),
		pdf: fileOf(formData, PDF_FIELD),
		raster: fileOf(formData, RASTER_FIELD),
		rasterDpi: Number.isFinite(dpi) && dpi > 0 ? dpi : null,
	};
};
