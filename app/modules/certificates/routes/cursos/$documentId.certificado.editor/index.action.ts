import type { CertificateActionData } from "../../../utils/certificate-form";
import { handleCertificateAction } from "../certificate-action.server";
import type { Route } from "./+types/index";

/** POST /dashboard/capacitaciones/:documentId/certificado/editor (`handleCertificateAction`). */
export const action = (
	args: Route.ActionArgs,
): Promise<CertificateActionData> => handleCertificateAction(args);
