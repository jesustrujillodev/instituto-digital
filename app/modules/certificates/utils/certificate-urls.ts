import type {
	CertificateExportFormat,
	SampleVersion,
} from "../domain/certificate.types";

/** Descarga de un certificado emitido: solo identificador y formato. */
export const certificateDownloadUrl = (
	issueDocumentId: string,
	format: CertificateExportFormat,
) => `/dashboard/certificados/${issueDocumentId}/descargar?formato=${format}`;

/** El diseño guardado con datos de muestra. */
export const certificateSampleUrl = (
	courseDocumentId: string,
	version: SampleVersion,
	format: CertificateExportFormat,
) =>
	`/dashboard/cursos/${courseDocumentId}/certificado/muestra?version=${version}&formato=${format}`;
