import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CheckInPreviewResponse,
	CheckInResponse,
	RotateQrTokenResponse,
} from "./check-in.types";

/**
 * Asistencia por QR (§6.8).
 *
 * El token opaco del curso ES la autorización para llegar al curso; quién marca
 * lo decide la inscripción del actor, no su alcance administrativo.
 */
export interface ICheckInService {
	/**
	 * Solo lectura: lo que la pantalla necesita ANTES de escribir. Aplica las
	 * mismas guardas que `register`, así que un rechazo se ve sin mutar nada.
	 */
	preview(token: string, actor: AuthContext): Promise<CheckInPreviewResponse>;

	/** Registra la asistencia del propio actor en la sesión activa. Idempotente. */
	register(token: string, actor: AuthContext): Promise<CheckInResponse>;

	/** Genera o rota el token del curso. Invalida el QR ya impreso. */
	rotateToken(
		documentId: string,
		actor: AuthContext,
	): Promise<RotateQrTokenResponse>;
}
