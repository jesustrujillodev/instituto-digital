/**
 * Break-glass del lockdown. Ejecutable con `bun`, sin HTTP ni sesión ni caché
 * — imprescindible para el alcance `all`, porque con `all` la aplicación no
 * puede levantarse a sí misma: el middleware bloquea toda petición
 * autenticada, incluida la de la ruta que levantaría el cierre
 * (docs/auth/02-revocacion-inmediata-epoch.md §B.5).
 *
 * Uso:
 *   bun run lockdown status
 *   bun run lockdown activate --scope=all --reason="..."
 *   bun run lockdown lift
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "@/core/env.server";
import { LOCKDOWN_SCOPES } from "@/modules/auth/domain/security-state.repository";
import { createSecurityStateRepository } from "@/modules/auth/infrastructure/security-state.repository.server";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const authConfig = {
	jwtSecret: env.JWT_SECRET,
	accessTokenTtlS: env.AUTH_ACCESS_TOKEN_TTL_S,
	refreshTokenTtlS: env.AUTH_REFRESH_TOKEN_TTL_S,
	refreshGraceS: env.AUTH_REFRESH_GRACE_S,
	issuer: env.AUTH_JWT_ISSUER,
	audience: env.AUTH_JWT_AUDIENCE,
	loginMaxPerEmail: env.AUTH_LOGIN_MAX_PER_EMAIL,
	loginMaxPerIp: env.AUTH_LOGIN_MAX_PER_IP,
	loginWindowS: env.AUTH_LOGIN_WINDOW_S,
	maxSessionsPerUser: env.AUTH_MAX_SESSIONS_PER_USER,
	securityStateCacheTtlS: env.AUTH_SECURITY_STATE_CACHE_TTL_S,
};

const repository = createSecurityStateRepository({ prisma, authConfig });

const flag = (name: string): string | undefined => {
	const prefix = `--${name}=`;
	const arg = process.argv.find((a) => a.startsWith(prefix));
	return arg?.slice(prefix.length);
};

const printState = (snapshot: {
	lockdownAt: Date | null;
	lockdownScope: string | null;
	lockdownReason: string | null;
	lockdownBy: number | null;
}) => {
	if (!snapshot.lockdownAt) {
		console.log("✅ Servicio normal — sin lockdown activo.");
		return;
	}

	console.log("🔒 LOCKDOWN ACTIVO");
	console.log(`   Desde:  ${snapshot.lockdownAt.toISOString()}`);
	console.log(`   Alcance: ${snapshot.lockdownScope}`);
	console.log(`   Por:     usuario #${snapshot.lockdownBy}`);
	console.log(`   Motivo:  ${snapshot.lockdownReason ?? "(sin motivo)"}`);
};

async function main() {
	const command = process.argv[2];

	switch (command) {
		case "status": {
			printState(await repository.get());
			break;
		}

		case "activate": {
			const scope = flag("scope");
			if (!scope || !LOCKDOWN_SCOPES.includes(scope as never)) {
				throw new Error(
					`--scope es obligatorio y debe ser uno de: ${LOCKDOWN_SCOPES.join(", ")}`,
				);
			}

			const { snapshot, purgedSessions } = await repository.lockdown({
				scope: scope as (typeof LOCKDOWN_SCOPES)[number],
				reason: flag("reason"),
				// 0: no hay usuario autenticado detrás de un script de CLI. La
				// columna admite null-ish pero se registra explícito para no
				// confundirlo con "no se sabe quién".
				by: 0,
			});

			console.log(`🔒 Lockdown activado. Sesiones purgadas: ${purgedSessions}`);
			printState(snapshot);
			break;
		}

		case "lift": {
			printState(await repository.lift());
			break;
		}

		default:
			throw new Error(
				'Uso: bun run lockdown <status|activate|lift> [--scope=all|except-admin] [--reason="..."]',
			);
	}
}

main()
	.catch((err) => {
		console.error("❌", err instanceof Error ? err.message : err);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
