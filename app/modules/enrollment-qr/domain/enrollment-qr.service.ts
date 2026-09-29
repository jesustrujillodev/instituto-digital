import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	EnrollmentQrPanelResponse,
	ResolveEnrollmentQrResponse,
	RotateEnrollmentQrTokenResponse,
} from "./enrollment-qr.types";

/**
 * QR de inscripción para publicitar un curso.
 *
 * El escaneo no inscribe: resuelve el curso y lo deja en la ficha del catálogo,
 * donde `enrollmentService.enroll` aplica cupo, cierre, audiencia y bajas.
 */
export interface IEnrollmentQrService {
	/**
	 * El curso del token si admite inscripción por QR y quien escanea está en su
	 * audiencia. No muestra nada del curso a quien no lo puede ver.
	 */
	resolve(
		token: string,
		actor: AuthContext,
	): Promise<ResolveEnrollmentQrResponse>;

	/** El token vigente, solo para quien organiza las inscripciones del curso. */
	find(
		documentId: string,
		actor: AuthContext,
	): Promise<EnrollmentQrPanelResponse>;

	/** Genera o rota el token. Invalida el QR ya impreso. */
	rotateToken(
		documentId: string,
		actor: AuthContext,
	): Promise<RotateEnrollmentQrTokenResponse>;
}
