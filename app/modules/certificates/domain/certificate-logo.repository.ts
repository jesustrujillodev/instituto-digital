import type {
	InstitutionalLogo,
	NewInstitutionalLogo,
} from "./certificate.types";

export interface ICertificateLogoRepository {
	/** Todos, archivados incluidos, del más reciente al más viejo. */
	list(): Promise<InstitutionalLogo[]>;
	findByDocumentIds(
		documentIds: readonly string[],
	): Promise<InstitutionalLogo[]>;
	findByStorageKeys(keys: readonly string[]): Promise<InstitutionalLogo[]>;
	create(logo: NewInstitutionalLogo): Promise<InstitutionalLogo>;
	/**
	 * Crea el sustituto y archiva el anterior en una sola transacción: nunca
	 * quedan dos vigentes ni ninguno.
	 */
	replace(
		previousDocumentId: string,
		logo: NewInstitutionalLogo,
		at: Date,
	): Promise<InstitutionalLogo>;
	setArchived(documentId: string, archivedAt: Date | null): Promise<void>;
}
