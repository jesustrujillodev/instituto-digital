import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type { UploadInput } from "@/shared/storage/upload-validation";
import type {
	CertificateEditor,
	CertificateFile,
	DownloadCertificateDto,
	DownloadSampleDto,
	IssuanceResult,
	IssueCandidate,
	SaveCertificateDraftDto,
} from "./certificate.types";

export interface ICertificateService {
	/** El curso, su diseño guardado y en qué estado está. */
	getEditor(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<AppResponse<CertificateEditor>>;

	saveDraft(
		dto: SaveCertificateDraftDto,
		actor: AuthContext,
	): Promise<AppResponse<null>>;

	/** Publica el borrador GUARDADO; lo que no se guardó no se publica. */
	publish(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<AppResponse<null>>;

	/** El borrador vuelve a ser el publicado. */
	discardDraft(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<AppResponse<null>>;

	/**
	 * Sube una imagen de firma y devuelve su referencia. No toca la base: la
	 * referencia entra al diseño cuando se guarda.
	 */
	uploadSignature(
		courseDocumentId: string,
		file: UploadInput,
		actor: AuthContext,
	): Promise<AppResponse<{ signatureUrl: string }>>;

	/**
	 * El PDF o PNG de una emisión, dibujado SOLO con lo congelado en la base.
	 * Lo descarga quien ve el curso en impartición.
	 */
	downloadIssue(
		dto: DownloadCertificateDto,
		actor: AuthContext,
	): Promise<AppResponse<CertificateFile>>;

	/** El diseño guardado (borrador o publicado) con datos de muestra. */
	downloadSample(
		dto: DownloadSampleDto,
		actor: AuthContext,
	): Promise<AppResponse<CertificateFile>>;
}

/**
 * Deja las emisiones de un curso igual que la lista de quién completó.
 *
 * No es un caso de uso: es la pieza que llama `completionSync`, dentro de la
 * transacción de quien escribe y con la fila del curso bloqueada, justo al lado
 * de los créditos. Por eso no devuelve `AppResponse` y deja que el repositorio
 * lance.
 */
export interface ICertificateIssuance {
	sync(
		courseId: number,
		completed: readonly IssueCandidate[],
		at: Date,
	): Promise<IssuanceResult>;
}
