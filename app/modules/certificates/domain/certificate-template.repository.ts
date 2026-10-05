import type {
	CertificateDesignV2,
	CertificateTemplate,
	NewCertificateTemplate,
} from "./certificate.types";
import type { TemplateVisibility } from "./certificate-template.access";
import type { StoredDesignRefs } from "./design/design.assets";

/** Una plantilla con lo que nombra su diseño tal como está en la base. */
export interface CertificateTemplateAssets extends StoredDesignRefs {
	template: CertificateTemplate;
}

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
	/** Para la fuente de referencias de storage: aun con el diseño ilegible. */
	findWithStorageRefs(
		documentIds: readonly string[],
	): Promise<CertificateTemplateAssets[]>;
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
