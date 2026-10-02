import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type { UploadInput } from "@/shared/storage/upload-validation";
import type { LogoOption } from "./certificate.types";

export interface ICertificateLogoService {
	/** Todos los logos para quien los administra, archivados incluidos. */
	list(actor: AuthContext): Promise<AppResponse<LogoOption[]>>;
	/**
	 * Lo que el editor necesita: todos, con `archived` marcado. El selector
	 * solo ofrece los vigentes; los archivados están para seguir pintando los
	 * diseños que ya los usan.
	 */
	listForEditor(): Promise<AppResponse<LogoOption[]>>;
	upload(
		name: string,
		file: UploadInput,
		actor: AuthContext,
	): Promise<AppResponse<LogoOption>>;
	replace(
		documentId: string,
		file: UploadInput,
		actor: AuthContext,
	): Promise<AppResponse<LogoOption>>;
	setArchived(
		documentId: string,
		archived: boolean,
		actor: AuthContext,
	): Promise<AppResponse<null>>;
}
