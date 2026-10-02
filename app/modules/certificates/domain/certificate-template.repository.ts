import type {
	CertificateDesignV2,
	CertificateTemplate,
	NewCertificateTemplate,
} from "./certificate.types";
import type { TemplateVisibility } from "./certificate-template.access";

export interface ICertificateTemplateRepository {
	/** Las que el alcance ve, de la más reciente a la más vieja. */
	listVisible(
		visibility: Exclude<TemplateVisibility, { kind: "none" }>,
		includeArchived: boolean,
	): Promise<CertificateTemplate[]>;
	findByDocumentId(documentId: string): Promise<CertificateTemplate | null>;
	findByDocumentIds(
		documentIds: readonly string[],
	): Promise<CertificateTemplate[]>;
	/** Con `documentId` propio: sus imágenes se copian antes de crear la fila. */
	create(
		template: NewCertificateTemplate & { documentId: string },
	): Promise<CertificateTemplate>;
	/** `updatedById` nulo: lo cambia el sistema (el gestor de nube), no una persona. */
	saveDesign(
		documentId: string,
		design: CertificateDesignV2,
		updatedById: number | null,
	): Promise<void>;
	rename(
		documentId: string,
		name: string,
		description: string | null,
		updatedById: number,
	): Promise<void>;
	setArchived(documentId: string, archivedAt: Date | null): Promise<void>;
}
