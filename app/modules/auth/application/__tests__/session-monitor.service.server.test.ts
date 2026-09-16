import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { SESSION_LIST_DEFAULTS } from "../../domain/auth.config";
import type { Session } from "../../domain/auth.types";
import { createSessionMonitorService } from "../session-monitor.service.server";

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";
const RAW_REFRESH_TOKEN = "raw-refresh-token";

const sessionOf = (overrides: Partial<Session> = {}): Session => ({
	id: SESSION_ID,
	userId: 7,
	refreshTokenHash: "hash",
	prevTokenHash: null,
	rotatedAt: null,
	userAgent: null,
	ipAddress: null,
	expiresAt: new Date("2026-08-30T12:00:00.000Z"),
	createdAt: new Date("2026-07-30T12:00:00.000Z"),
	updatedAt: new Date("2026-07-30T12:00:00.000Z"),
	...overrides,
});

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

/**
 * Dobles mínimos: solo lo que tocan las tres operaciones bajo prueba. El resto
 * del puerto se deja fuera a propósito — un doble completo escondería qué
 * depende realmente de qué.
 */
const createHarness = (
	options: {
		/** `null` ⇒ la sesión buscada por id no existe. */
		session?: Session | null;
		/** `null` ⇒ el refresh token propio no resuelve a ninguna sesión. */
		currentSession?: Session | null;
		sessions?: Session[];
		total?: number;
		expiredCount?: number;
	} = {},
) => {
	const calls = {
		deleteAllByUserId: [] as number[],
		deleteAllExcept: [] as string[],
		deleteById: [] as string[],
		revokeUserTokens: [] as number[],
		revokeAllTokens: 0,
		findAll: [] as unknown[],
		findByInternalId: [] as number[],
		deleteExpired: 0,
	};

	const sessionRepository = {
		findById: async () =>
			options.session === undefined ? sessionOf() : options.session,
		findByTokenHash: async () =>
			options.currentSession === undefined
				? sessionOf()
				: options.currentSession,
		findAll: async (filters: unknown) => {
			calls.findAll.push(filters);
			return options.sessions ?? [];
		},
		count: async () => options.total ?? 0,
		deleteById: async (id: string) => {
			calls.deleteById.push(id);
		},
		deleteAllByUserId: async (userId: number) => {
			calls.deleteAllByUserId.push(userId);
		},
		deleteAllExcept: async (id: string) => {
			calls.deleteAllExcept.push(id);
			return 3;
		},
		deleteExpired: async () => {
			calls.deleteExpired += 1;
			return options.expiredCount ?? 0;
		},
	} as unknown as ICradle["sessionRepository"];

	const securityStateRepository = {
		get: async () => {
			throw new Error("not used in these tests");
		},
		revokeAllTokens: async () => {
			calls.revokeAllTokens += 1;
			return {
				tokensValidAfter: new Date(),
				lockdownAt: null,
				lockdownScope: null,
				lockdownReason: null,
				lockdownBy: null,
				userTokensValidAfter: new Map(),
				readAt: new Date(),
			};
		},
		revokeUserTokens: async (userId: number) => {
			calls.revokeUserTokens.push(userId);
		},
	} as unknown as ICradle["securityStateRepository"];

	const userRepository = {
		findByInternalId: async (id: number) => {
			calls.findByInternalId.push(id);
			return {
				id,
				documentId: `doc-${id}`,
				email: `usuario${id}@empresa.com`,
				firstName: "Ana",
				lastName: "Ruiz",
			};
		},
	} as unknown as ICradle["userRepository"];

	const service = createSessionMonitorService({
		sessionRepository,
		userRepository,
		tokenService: {
			hashRefreshToken: (raw: string) => `hashed:${raw}`,
		} as unknown as ICradle["tokenService"],
		securityStateRepository,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("createSessionMonitorService — revocation and the validity epoch", () => {
	// El epoch es global o por usuario, nunca por sesión: tocarlo aquí expulsaría
	// también las demás sesiones del mismo usuario, que no es lo que se pidió.
	test("revoke deletes the session and does NOT touch any epoch", async () => {
		const { service, calls } = createHarness();

		const result = await service.revoke(SESSION_ID);

		expect(result.success).toBe(true);
		expect(calls.deleteById).toEqual([SESSION_ID]);
		expect(calls.revokeUserTokens).toEqual([]);
		expect(calls.revokeAllTokens).toBe(0);
	});

	test("revokeAllForUser bumps that user's epoch after deleting the sessions", async () => {
		const { service, calls } = createHarness();

		const result = await service.revokeAllForUser(7);

		expect(result.success).toBe(true);
		expect(calls.deleteAllByUserId).toEqual([7]);
		expect(calls.revokeUserTokens).toEqual([7]);
		// El corte de un usuario no debe mover el epoch global.
		expect(calls.revokeAllTokens).toBe(0);
	});

	test("revokeAllExceptCurrent bumps the global epoch", async () => {
		const { service, calls } = createHarness();

		const result = await service.revokeAllExceptCurrent(RAW_REFRESH_TOKEN);

		expect(result.success).toBe(true);
		if (result.success) expect(result.data.revokedCount).toBe(3);
		expect(calls.deleteAllExcept).toEqual([SESSION_ID]);
		expect(calls.revokeAllTokens).toBe(1);
	});
});

describe("createSessionMonitorService — list", () => {
	test("projects each session into its admin summary", async () => {
		const { service } = createHarness({ sessions: [sessionOf()], total: 1 });

		const result = await service.list({});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toHaveLength(1);
			expect(result.data[0].ownerEmail).toBe("usuario7@empresa.com");
			expect(result.data[0].ownerFullName).toBe("Ana Ruiz");
		}
	});

	// El listado NUNCA debe exponer material secreto: el mapper enumera los campos
	// que salen, y esto lo comprueba de punta a punta del caso de uso.
	test("no token hash reaches the response", async () => {
		const { service } = createHarness({
			sessions: [sessionOf({ refreshTokenHash: "secreto-vigente" })],
			total: 1,
		});

		const result = await service.list({});

		expect(JSON.stringify(result)).not.toContain("secreto-vigente");
	});

	// Los dueños se resuelven DEDUPLICADOS: con el cap por usuario, una página de
	// 10 filas puede ser un solo usuario, y sin deduplicar serían 10 consultas.
	test("resolves each distinct owner exactly once", async () => {
		const { service, calls } = createHarness({
			sessions: [
				sessionOf({ id: "a", userId: 7 }),
				sessionOf({ id: "b", userId: 7 }),
				sessionOf({ id: "c", userId: 9 }),
			],
			total: 3,
		});

		await service.list({});

		expect(calls.findByInternalId).toEqual([7, 9]);
	});

	test("marks the session the panel is being viewed from", async () => {
		const { service } = createHarness({
			sessions: [sessionOf({ id: SESSION_ID }), sessionOf({ id: "otra" })],
			total: 2,
		});

		const result = await service.list({}, RAW_REFRESH_TOKEN);

		expect(result.success && result.data.map((s) => s.isCurrent)).toEqual([
			true,
			false,
		]);
	});

	// Sin token de refresh no hay sesión propia que marcar: ninguna fila debe
	// aparecer como "esta es la tuya".
	test("marks nothing as current when no refresh token is given", async () => {
		const { service } = createHarness({
			sessions: [sessionOf({ id: SESSION_ID })],
			total: 1,
		});

		const result = await service.list({});

		expect(result.success && result.data[0].isCurrent).toBe(false);
	});

	test("derives the pagination from the shared defaults when filters are absent", async () => {
		const { service } = createHarness({ sessions: [], total: 25 });

		const result = await service.list({});

		expect(result.success && result.pagination).toEqual({
			page: SESSION_LIST_DEFAULTS.page,
			pageSize: SESSION_LIST_DEFAULTS.pageSize,
			total: 25,
			totalPages: 3,
		});
	});

	test("passes the filters through to the repository untouched", async () => {
		const { service, calls } = createHarness({ total: 0 });

		await service.list({ status: "expired", userId: 7 });

		expect(calls.findAll).toEqual([{ status: "expired", userId: 7 }]);
	});

	test("an empty page is a success, not a failure", async () => {
		const { service } = createHarness({ sessions: [], total: 0 });

		const result = await service.list({});

		expect(result.success).toBe(true);
		expect(result.success && result.data).toEqual([]);
	});
});

describe("createSessionMonitorService — revoke", () => {
	// `deleteById` es idempotente y no distinguiría "ya no existe" de "revocada
	// ahora". El panel sí necesita distinguirlo: revocar algo que ya desapareció
	// debe decirlo, no fingir éxito.
	test("a missing session says so instead of faking success", async () => {
		const { service, calls } = createHarness({ session: null });

		const result = await service.revoke(SESSION_ID);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("SESSION_NOT_FOUND");
		expect(calls.deleteById).toEqual([]);
	});
});

describe("createSessionMonitorService — revokeAllExceptCurrent", () => {
	// Sin sesión que preservar no se revoca NADA: el borrado dejaría fuera también
	// a quien pidió la operación, que es justo lo que la excepción evita.
	test("revokes nothing when the current session cannot be resolved", async () => {
		const { service, calls } = createHarness({ currentSession: null });

		const result = await service.revokeAllExceptCurrent(RAW_REFRESH_TOKEN);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("INVALID_SESSION");
		expect(calls.deleteAllExcept).toEqual([]);
		expect(calls.revokeAllTokens).toBe(0);
	});
});

describe("createSessionMonitorService — cleanupExpired", () => {
	// Higiene de datos, no seguridad: una sesión expirada ya se rechaza en el caso
	// de uso. Por eso NO toca ningún epoch.
	test("returns the count and touches no epoch", async () => {
		const { service, calls } = createHarness({ expiredCount: 12 });

		const result = await service.cleanupExpired();

		expect(result.success && result.data.revokedCount).toBe(12);
		expect(calls.deleteExpired).toBe(1);
		expect(calls.revokeAllTokens).toBe(0);
		expect(calls.revokeUserTokens).toEqual([]);
	});

	test("zero expired sessions is still a success", async () => {
		const { service } = createHarness({ expiredCount: 0 });

		const result = await service.cleanupExpired();

		expect(result.success && result.data.revokedCount).toBe(0);
	});
});
