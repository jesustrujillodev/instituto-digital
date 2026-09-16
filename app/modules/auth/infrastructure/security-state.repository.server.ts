import type { PrismaClient } from "@prisma/client";
import type { AuthConfig } from "../domain/auth.config";
import {
	LOCKDOWN_SCOPES,
	type LockdownScope,
	type SecuritySnapshot,
	type SecurityStateRepository,
} from "../domain/security-state.repository";
import { exemptRolesFor } from "../domain/security-state.rules";

type Dependencies = {
	prisma: PrismaClient;
	authConfig: AuthConfig;
};

/** La columna es un `String?` libre; el dominio solo admite la allowlist. */
const toLockdownScope = (value: string | null): LockdownScope | null =>
	LOCKDOWN_SCOPES.includes(value as LockdownScope)
		? (value as LockdownScope)
		: null;

export const createSecurityStateRepository = ({
	prisma,
	authConfig,
}: Dependencies): SecurityStateRepository => {
	const readSnapshot = async (): Promise<SecuritySnapshot> => {
		// Horizonte de relevancia: un epoch de usuario más antiguo que el TTL del
		// access token no puede invalidar nada — todo token emitido antes de él ya
		// expiró solo. Acotar aquí es lo que impide que esta lectura crezca con el
		// histórico de revocaciones (docs/auth/02 §"el epoch por usuario").
		const horizon = new Date(Date.now() - authConfig.accessTokenTtlS * 1000);

		// Una sola ida a la base: la fila de estado y los epochs vigentes viajan
		// juntos. Son dos consultas separadas en el plan del motor, pero un único
		// round-trip — y este código corre detrás de una caché, no por petición.
		const [row, users] = await prisma.$transaction([
			prisma.securityState.findUnique({ where: { id: 1 } }),
			prisma.user.findMany({
				where: { tokensValidAfter: { gt: horizon } },
				select: { id: true, tokensValidAfter: true },
			}),
		]);

		if (!row) {
			throw new Error(
				"security_state row missing — run the seed (bun run seed)",
			);
		}

		return {
			tokensValidAfter: row.tokensValidAfter,
			lockdownAt: row.lockdownAt,
			lockdownScope: toLockdownScope(row.lockdownScope),
			lockdownReason: row.lockdownReason,
			lockdownBy: row.lockdownBy,
			userTokensValidAfter: new Map(
				// El filtro ya garantiza no-null; el select no lo sabe expresar.
				users.flatMap((user) =>
					user.tokensValidAfter
						? [[user.id, user.tokensValidAfter] as const]
						: [],
				),
			),
			readAt: new Date(),
		};
	};

	return {
		get: readSnapshot,

		async revokeAllTokens() {
			// `now()` es el de POSTGRES, no el del proceso. Con varios nodos, uno con
			// el reloj adelantado invalidaría tokens legítimos y uno atrasado dejaría
			// vivos los que debía matar: usar la hora del store elimina la clase de
			// error entera (docs/auth/01 §7.3).
			await prisma.$executeRaw`
				INSERT INTO auth.security_state (id, tokens_valid_after, "updatedAt")
				VALUES (1, now(), now())
				ON CONFLICT (id) DO UPDATE
					SET tokens_valid_after = now(), "updatedAt" = now()
			`;

			return readSnapshot();
		},

		async revokeUserTokens(userId) {
			// Mismo motivo que arriba: la hora la pone la base.
			await prisma.$executeRaw`
				UPDATE auth.users SET tokens_valid_after = now() WHERE id = ${userId}
			`;
		},

		async lockdown({ scope, reason, by }) {
			// Las tres escrituras en una sola transacción: fuera de ella hay
			// ventanas reales en cualquier orden (docs/auth/02 §B.4).
			const [, purgedSessions] = await prisma.$transaction([
				prisma.$executeRaw`
					INSERT INTO auth.security_state
						(id, tokens_valid_after, lockdown_at, lockdown_scope, lockdown_reason, lockdown_by, "updatedAt")
					VALUES (1, now(), now(), ${scope}, ${reason ?? null}, ${by}, now())
					ON CONFLICT (id) DO UPDATE
						SET tokens_valid_after = now(),
							lockdown_at = now(),
							lockdown_scope = ${scope},
							lockdown_reason = ${reason ?? null},
							lockdown_by = ${by},
							"updatedAt" = now()
				`,
				// Los exentos salen de la MISMA fuente que usa `isLockedOutForRole`:
				// si la purga borrase la sesión de un rol que la regla deja pasar, el
				// cierre echaría a quien tiene que levantarlo.
				scope === "all"
					? prisma.session.deleteMany({})
					: prisma.session.deleteMany({
							where: { user: { role: { notIn: [...exemptRolesFor(scope)] } } },
						}),
			]);

			return {
				snapshot: await readSnapshot(),
				purgedSessions: purgedSessions.count,
			};
		},

		async lift() {
			await prisma.$executeRaw`
				UPDATE auth.security_state
				SET lockdown_at = NULL, lockdown_scope = NULL, lockdown_reason = NULL, lockdown_by = NULL, "updatedAt" = now()
				WHERE id = 1
			`;

			return readSnapshot();
		},
	};
};
