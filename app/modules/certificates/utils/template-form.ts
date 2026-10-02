import type { AppResponse } from "@/shared/response/response.types";
import type {
	CertificateTemplateView,
	UploadedBackground,
	UploadedImage,
} from "../domain/certificate.types";

export const TEMPLATE_INTENTS = {
	create: "create",
	rename: "rename",
	archive: "archive",
} as const;

export const TEMPLATES_PATH = "/dashboard/plantillas-de-certificado";

export const templateEditorPath = (templateDocumentId: string) =>
	`${TEMPLATES_PATH}/${templateDocumentId}/editor`;

export type TemplateActionData = AppResponse<
	CertificateTemplateView | UploadedImage | UploadedBackground | null
>;
