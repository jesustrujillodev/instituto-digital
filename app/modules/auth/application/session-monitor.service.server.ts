import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { SESSION_LIST_DEFAULTS } from "../domain/auth.config";
import {
	InvalidSessionError,
	SessionNotFoundError,
} from "../domain/auth.errors";
import { toSessionSummary } from "../domain/auth.mapper";
import type { ListSessionsDto } from "../domain/auth.types";
import type { SessionMonitorService } from "../domain/session-monitor.service";

type Dependencies = {
	sessionRepository: ICradle["sessionRepository"];
	userRepository: ICradle["userRepository"];
	tokenService: ICradle["tokenService"];
	securityStateRepository: ICradle["securityStateRepository"];
	logger: ICradle["logger"];
};

export const createSessionMonitorService = ({
	sessionRepository,
	userRepository,
	tokenService,
	securityStateRepository,
	logger,
}: Dependencies): SessionMonitorService => {
	const log = logger.child({ module: "session-monitor" });
	// Toda operación pasa por el runner: es lo que convierte en la rama
	// `success: false` del envelope lo que lanzan el repositorio y los errores de
	// dominio, y lo que registra los inesperados.
	const run = createOperationRunner(log);

	// El id de la sesión propia se deriva del token crudo. Se aísla porque lo
	// comparten `list` (para marcar la fila) y `revokeAllExceptCurrent` (para
	// preservarla), y ambos deben resolverlo EXACTAMENTE igual.
	const resolveCurrentSessionId = async (refreshToken?: string) => {
		if (!refreshToken) return null;

		const session = await sessionRepository.findByTokenHash(
			tokenService.hashRefreshToken(refreshToken),
		);
		return session?.id ?? null;
	};

	return {
		async list(filters: ListSessionsDto, currentRefreshToken?: string) {
			return run("list", async () => {
				// Las tres son independientes entre sí; encadenarlas triplicaría la
				// latencia del listado.
				const [sessions, total, currentSessionId] = await Promise.all([
					sessionRepository.findAll(filters),
					sessionRepository.count(filters),
					resolveCurrentSessionId(currentRefreshToken),
				]);

				// Los dueños se resuelven deduplicados: N sesiones del mismo usuario
				// son UNA consulta, no N. Con el cap por usuario activo, una página de
				// 10 filas puede ser un solo usuario.
				const ownerIds = [
					...new Set(sessions.map((session) => session.userId)),
				];
				const owners = await Promise.all(
					ownerIds.map((id) => userRepository.findByInternalId(id)),
				);
				const ownerById = new Map(
					owners
						.filter((owner) => owner !== null)
						.map((owner) => [owner.id, owner]),
				);

				const ctx = { now: Date.now(), currentSessionId };
				const data = sessions.map((session) =>
					toSessionSummary(session, ownerById.get(session.userId) ?? null, ctx),
				);

				return ok(data, {
					pagination: toPaginationMeta({
						page: filters.page ?? SESSION_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? SESSION_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},

		// Única acción del panel que NO es inmediata: el epoch es global o por
		// usuario, nunca por sesión. Cortar una sola sesión al instante exigiría
		// introspección por petición, que es justo lo descartado (docs/auth/01
		// §3.2). El dispositivo queda fuera al expirar su access token.
		async revoke(sessionId: string) {
			return run("revoke", async () => {
				// `deleteById` es idempotente y no distinguiría "ya no existe" de
				// "revocada ahora". El panel sí necesita distinguirlo: revocar algo que
				// ya desapareció debe decirlo, no fingir éxito.
				const session = await sessionRepository.findById(sessionId);
				if (!session) throw new SessionNotFoundError();

				await sessionRepository.deleteById(sessionId);

				return ok(null);
			});
		},

		async revokeAllForUser(userId: number) {
			return run("revokeAllForUser", async () => {
				await sessionRepository.deleteAllByUserId(userId);

				// El borrado mata la RENOVACIÓN; el epoch mata el acceso EN CURSO.
				// Va después a propósito: si fallara el borrado, no interesa haber
				// subido un epoch que no se corresponde con nada.
				await securityStateRepository.revokeUserTokens(userId);

				return ok(null);
			});
		},

		async revokeAllExceptCurrent(currentRefreshToken: string) {
			return run("revokeAllExceptCurrent", async () => {
				const currentSessionId =
					await resolveCurrentSessionId(currentRefreshToken);
				// Sin sesión que preservar no se revoca NADA: el borrado dejaría fuera
				// también a quien pidió la operación, que es justo lo que evita.
				if (!currentSessionId) throw new InvalidSessionError();

				const revokedCount =
					await sessionRepository.deleteAllExcept(currentSessionId);

				// Sube el epoch GLOBAL: mata también el access token de quien ejecuta
				// la acción, y aun así NO lo expulsa. Su sesión sobrevive al borrado,
				// así que en su siguiente petición cae en el silent refresh que ya
				// existe, acuña un token con `iat > epoch` y sigue navegando. Los
				// demás no tienen sesión que renovar y acaban en login.
				// Es contraintuitivo y es correcto: el epoch no admite excepciones por
				// token, y no las necesita.
				await securityStateRepository.revokeAllTokens();

				// Señal de auditoría: es la acción más destructiva del panel y la que
				// explica un pico de logins en los minutos siguientes.
				log.warn("global session revocation", {
					revokedCount,
					preservedSessionId: currentSessionId,
				});

				return ok({ revokedCount });
			});
		},

		async cleanupExpired() {
			return run("cleanupExpired", async () => {
				const revokedCount = await sessionRepository.deleteExpired();

				return ok({ revokedCount });
			});
		},
	};
};

export type { SessionMonitorService };
