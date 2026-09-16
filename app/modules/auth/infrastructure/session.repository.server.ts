import { Prisma, type PrismaClient } from "@prisma/client";
import { SESSION_LIST_DEFAULTS } from "../domain/auth.config";
import { toSessionDomain } from "../domain/auth.mapper";
import type { ListSessionsDto } from "../domain/auth.types";
import type { SessionRepository } from "../domain/session.repository";

type Dependencies = { prisma: PrismaClient };

// Campos del DUEÑO sobre los que aplica la búsqueda libre: quien administra
// busca "la sesión de fulano", no un UUID que no ha visto nunca.
const OWNER_SEARCHABLE_FIELDS = ["email", "firstName", "lastName"] as const;

// Filtrar por `user: { ... }` navega la relación en la consulta; no denormaliza
// nada. La tabla `sessions` sigue sin copiar datos del usuario (docs/auth §3).
const toFilters = (dto: ListSessionsDto) => {
	const now = new Date();
	// Sin `status` explícito se listan solo las vigentes: es lo que espera quien
	// abre un monitor de sesiones ACTIVAS.
	const statusFilter =
		dto.status === "all"
			? {}
			: dto.status === "expired"
				? { expiresAt: { lt: now } }
				: { expiresAt: { gte: now } };

	return {
		...(dto.userId && { userId: dto.userId }),
		...statusFilter,
		...(dto.search && {
			user: {
				OR: OWNER_SEARCHABLE_FIELDS.map((field) => ({
					[field]: { contains: dto.search, mode: Prisma.QueryMode.insensitive },
				})),
			},
		}),
	};
};

// El campo ya viene restringido por la allowlist de listSessionsRule, así que
// aquí solo queda elegir el default: lo más reciente primero.
const toOrderBy = (dto: ListSessionsDto) => ({
	[dto.sortBy ?? "createdAt"]: dto.sortDir ?? "desc",
});

export const createSessionRepository = ({
	prisma,
}: Dependencies): SessionRepository => {
	return {
		async create(params) {
			const session = await prisma.session.create({
				data: {
					userId: params.userId,
					refreshTokenHash: params.refreshTokenHash,
					expiresAt: params.expiresAt,
					userAgent: params.userAgent,
					ipAddress: params.ipAddress,
				},
			});
			return toSessionDomain(session as Record<string, unknown>);
		},

		async findByTokenHash(tokenHash) {
			const session = await prisma.session.findFirst({
				where: {
					OR: [{ refreshTokenHash: tokenHash }, { prevTokenHash: tokenHash }],
				},
			});
			return session
				? toSessionDomain(session as Record<string, unknown>)
				: null;
		},

		async rotateIfCurrent({
			sessionId,
			expectedTokenHash,
			newTokenHash,
			newExpiresAt,
			rotatedAt,
		}) {
			// updateMany para condicionar por el hash vigente y leer el conteo:
			// la base de datos arbitra la carrera en un solo statement.
			const { count } = await prisma.session.updateMany({
				where: { id: sessionId, refreshTokenHash: expectedTokenHash },
				data: {
					refreshTokenHash: newTokenHash,
					prevTokenHash: expectedTokenHash,
					rotatedAt,
					expiresAt: newExpiresAt,
				},
			});
			return count === 1 ? "rotated" : "stale";
		},

		async findAll(filters) {
			// Los defaults salen de auth.config.ts y no de literales aquí: el
			// servicio usa los mismos para construir la `pagination`, y dos valores
			// distintos describirían una página que no es la consultada.
			const page = filters.page ?? SESSION_LIST_DEFAULTS.page;
			const pageSize = filters.pageSize ?? SESSION_LIST_DEFAULTS.pageSize;

			const sessions = await prisma.session.findMany({
				where: toFilters(filters),
				orderBy: toOrderBy(filters),
				skip: (page - 1) * pageSize,
				take: pageSize,
			});
			return sessions.map((session) =>
				toSessionDomain(session as Record<string, unknown>),
			);
		},

		async count(filters) {
			return prisma.session.count({ where: toFilters(filters) });
		},

		async findById(sessionId) {
			const session = await prisma.session.findUnique({
				where: { id: sessionId },
			});
			return session
				? toSessionDomain(session as Record<string, unknown>)
				: null;
		},

		async deleteById(sessionId) {
			await prisma.session.deleteMany({ where: { id: sessionId } });
		},

		async deleteAllByUserId(userId) {
			await prisma.session.deleteMany({ where: { userId } });
		},

		async deleteAllExcept(sessionId) {
			const { count } = await prisma.session.deleteMany({
				where: { id: { not: sessionId } },
			});
			return count;
		},

		async deleteOldestExceeding({ userId, keep }) {
			const excess = await prisma.session.findMany({
				where: { userId },
				orderBy: { createdAt: "desc" },
				skip: keep,
				select: { id: true },
			});
			if (excess.length > 0) {
				await prisma.session.deleteMany({
					where: { id: { in: excess.map((s) => s.id) } },
				});
			}
		},

		async deleteExpired() {
			const { count } = await prisma.session.deleteMany({
				where: { expiresAt: { lt: new Date() } },
			});
			return count;
		},
	};
};
