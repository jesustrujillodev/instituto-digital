import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type { UploadInput } from "@/shared/storage/upload-validation";
import type {
	CertificateDesignV2,
	CertificateTemplateView,
	UploadedBackground,
	UploadedImage,
} from "./certificate.types";
import type {
	ApplyTemplateDto,
	CreateTemplateDto,
	RenameTemplateDto,
	SaveTemplateDesignDto,
	TemplateFromCourseDto,
} from "./certificate-template.rules";

export interface ICertificateTemplateService {
	/** Las que ve quien pregunta; archivadas solo si las pide y puede editarlas. */
	list(
		actor: AuthContext,
		options: { includeArchived: boolean },
	): Promise<AppResponse<CertificateTemplateView[]>>;
	get(
		documentId: string,
		actor: AuthContext,
	): Promise<AppResponse<CertificateTemplateView>>;
	/** Nace con el diseño institucional, en el alcance de quien la crea. */
	create(
		dto: CreateTemplateDto,
		actor: AuthContext,
	): Promise<AppResponse<CertificateTemplateView>>;
	rename(
		dto: RenameTemplateDto,
		actor: AuthContext,
	): Promise<AppResponse<null>>;
	saveDesign(
		dto: SaveTemplateDesignDto,
		actor: AuthContext,
	): Promise<AppResponse<null>>;
	setArchived(
		documentId: string,
		archived: boolean,
		actor: AuthContext,
	): Promise<AppResponse<null>>;
	uploadImage(
		documentId: string,
		file: UploadInput,
		actor: AuthContext,
	): Promise<AppResponse<UploadedImage>>;
	uploadBackground(
		dto: {
			documentId: string;
			pdf: UploadInput;
			raster: UploadInput;
			rasterDpi: number;
		},
		actor: AuthContext,
	): Promise<AppResponse<UploadedBackground>>;
	/**
	 * Guarda el diseño en pantalla de un curso como plantilla: sin firmas y con
	 * copias de sus imágenes en la carpeta de la plantilla.
	 */
	fromCourse(
		dto: TemplateFromCourseDto,
		actor: AuthContext,
	): Promise<AppResponse<CertificateTemplateView>>;
	/**
	 * El diseño de una plantilla listo para el curso, con sus imágenes copiadas
	 * a la carpeta del curso. No guarda nada: el editor lo recibe como cambio.
	 */
	apply(
		dto: ApplyTemplateDto,
		actor: AuthContext,
	): Promise<AppResponse<CertificateDesignV2>>;
}
