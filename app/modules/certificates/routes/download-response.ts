import type { CertificateFile } from "../domain/certificate.types";

/** El archivo como descarga, sin caché: es un documento personal. */
export const toDownloadResponse = ({
	file,
	contentType,
	fileName,
}: CertificateFile): Response =>
	new Response(file, {
		headers: {
			"Content-Type": contentType,
			"Content-Disposition": `attachment; filename="${fileName}"`,
			"Content-Length": String(file.byteLength),
			"Cache-Control": "private, no-store",
		},
	});
