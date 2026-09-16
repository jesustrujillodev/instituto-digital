import { parseTokenCookies } from "@/core/cookies.server";
import { requireRole } from "@/shared/auth/require-role.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { SESSION_MONITOR_ROLES } from "../../domain/auth.rules";
import {
	validateLockdown,
	validateRevokeSession,
	validateRevokeUserSessions,
} from "../../domain/auth.validators";
import { SESSION_MONITOR_ERROR_MESSAGES } from "../../utils/session-monitor-error-messages";
import {
	INTENT_FIELD,
	SESSION_INTENTS,
	type SessionMonitorActionData,
} from "../../utils/session-monitor-form";
import type { Route } from "./+types/index";

/** "1 sesión" / "3 sesiones" — el conteo se le enseña a una persona. */
const sessionCount = (count: number) =>
	count === 1 ? "1 sesión" : `${count} sesiones`;

/**
 * Mutaciones del monitor: revocar una sesión, todas las de un usuario, todas
 * las de la plataforma salvo la propia, y limpiar las expiradas.
 *
 * No hay escalera de `catch`: el servicio ya devuelve el envelope con un código
 * estable y `localizeError` le pone la copia. Lo único que sigue lanzando aquí
 * es la validación de frontera, y de eso se encarga `parseInput`.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<SessionMonitorActionData> => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	const auth = await requireRole(request, context, SESSION_MONITOR_ROLES);

	const formData = await request.formData();
	const intent = formData.get(INTENT_FIELD);

	switch (intent) {
		case SESSION_INTENTS.revokeSession: {
			const input = parseInput(
				() =>
					validateRevokeSession({ sessionId: formData.get("sessionId") })
						.sessionId,
			);
			if (!input.success) {
				return localizeError(input, SESSION_MONITOR_ERROR_MESSAGES);
			}

			const result = await context.sessionMonitorService.revoke(input.data);
			if (!result.success) {
				return localizeError(result, SESSION_MONITOR_ERROR_MESSAGES);
			}

			return ok(null, { message: "Sesión revocada" });
		}

		case SESSION_INTENTS.revokeUser: {
			const input = parseInput(
				// El formulario manda texto; el número lo exige la regla de dominio.
				() =>
					validateRevokeUserSessions({ userId: Number(formData.get("userId")) })
						.userId,
			);
			if (!input.success) {
				return localizeError(input, SESSION_MONITOR_ERROR_MESSAGES);
			}

			const result = await context.sessionMonitorService.revokeAllForUser(
				input.data,
			);
			if (!result.success) {
				return localizeError(result, SESSION_MONITOR_ERROR_MESSAGES);
			}

			return ok(null, {
				message: "Se revocaron las sesiones del usuario",
			});
		}

		case SESSION_INTENTS.revokeAll: {
			// Se pasa el token crudo: hashearlo y resolver la sesión es del servicio,
			// el adaptador no manipula secretos (mismo trato que en /cerrar-sesion).
			const { refreshToken } = await parseTokenCookies(
				request.headers.get("Cookie"),
			);

			// Sin cookie no se corta aquí: el servicio ya trata "no resuelve a una
			// sesión" como INVALID_SESSION y ese es el único sitio que decide que
			// esta operación no puede correr sin una sesión que preservar.
			const result = await context.sessionMonitorService.revokeAllExceptCurrent(
				refreshToken ?? "",
			);
			if (!result.success) {
				return localizeError(result, SESSION_MONITOR_ERROR_MESSAGES);
			}

			return ok(null, {
				message: `Se revocaron ${sessionCount(result.data.revokedCount)}. La tuya sigue activa.`,
			});
		}

		case SESSION_INTENTS.cleanupExpired: {
			const result = await context.sessionMonitorService.cleanupExpired();
			if (!result.success) {
				return localizeError(result, SESSION_MONITOR_ERROR_MESSAGES);
			}

			return ok(null, {
				message: `Se eliminaron ${sessionCount(result.data.revokedCount)} expiradas`,
			});
		}

		case SESSION_INTENTS.lockdown: {
			const input = parseInput(() =>
				validateLockdown({
					scope: formData.get("scope"),
					reason: formData.get("reason") || undefined,
					confirmation: formData.get("confirmation"),
				}),
			);
			if (!input.success) {
				return localizeError(input, SESSION_MONITOR_ERROR_MESSAGES);
			}

			const result = await context.securityStateService.lockdown(
				input.data,
				auth.userId,
			);
			if (!result.success) {
				return localizeError(result, SESSION_MONITOR_ERROR_MESSAGES);
			}

			return ok(null, {
				message: `Lockdown activado. ${sessionCount(result.data.purgedSessions)} purgadas.`,
			});
		}

		case SESSION_INTENTS.lift: {
			const result = await context.securityStateService.lift();
			if (!result.success) {
				return localizeError(result, SESSION_MONITOR_ERROR_MESSAGES);
			}

			return ok(null, { message: "Lockdown levantado" });
		}

		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
