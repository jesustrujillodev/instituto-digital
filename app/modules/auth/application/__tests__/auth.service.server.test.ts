import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { PlatformLockedError } from "../../domain/auth.errors";
import type { SecuritySnapshot } from "../../domain/security-state.repository";
import { createAuthService } from "../auth.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const snapshotOf = (
	overrides: Partial<SecuritySnapshot> = {},
): SecuritySnapshot => ({
	tokensValidAfter: new Date(0),
	lockdownAt: null,
	lockdownScope: null,
	lockdownReason: null,
	lockdownBy: null,
	userTokensValidAfter: new Map(),
	readAt: new Date(),
	...overrides,
});

/**
 * Dobles mínimos: solo lo que tocan `login` y `refresh` bajo prueba. El resto
 * del cradle se deja fuera a propósito — un doble completo escondería qué
 * depende realmente de qué (mismo criterio que session-monitor.service.server.test.ts).
 */
const createHarness = (
	snapshot: SecuritySnapshot,
	options: { role?: string } = {},
) => {
	const calls = { compare: 0 };
	const role = options.role ?? "SUPERADMIN";

	const passwordService = {
		hash: async () => "dummy-hash",
		compare: async () => {
			calls.compare += 1;
			return true;
		},
	} as unknown as ICradle["passwordService"];

	const userRepository = {
		findByEmail: async () => ({
			id: 1,
			documentId: "11111111-1111-4111-8111-111111111111",
			email: "admin@test.com",
			password: "hashed",
			role,
			dependencyId: null,
			isTrainer: false,
		}),
		findByInternalId: async () => ({
			id: 1,
			documentId: "11111111-1111-4111-8111-111111111111",
			email: "admin@test.com",
			role,
			dependencyId: null,
			isTrainer: false,
		}),
	} as unknown as ICradle["userRepository"];

	const sessionRepository = {
		create: async () => {},
		deleteOldestExceeding: async () => {},
		findByTokenHash: async () => ({
			id: "8f1a2b3c-0000-4000-8000-000000000001",
			userId: 1,
			refreshTokenHash: "hashed:incoming",
			prevTokenHash: null,
			rotatedAt: null,
			userAgent: null,
			ipAddress: null,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
	} as unknown as ICradle["sessionRepository"];

	const tokenService = {
		signAccessToken: async () => "signed-token",
		generateRefreshToken: () => "new-refresh-token",
		hashRefreshToken: (raw: string) => `hashed:${raw}`,
		getRefreshTokenExpiry: () => new Date(Date.now() + 1000),
	} as unknown as ICradle["tokenService"];

	const securityStateRepository = {
		get: async () => snapshot,
	} as unknown as ICradle["securityStateRepository"];

	const service = createAuthService({
		sessionRepository,
		tokenService,
		userRepository,
		passwordService,
		singleFlight: { run: (_key, _ttl, fn) => fn() } as ICradle["singleFlight"],
		rateLimiter: {
			consume: () => ({ allowed: true, retryAfterMs: 0 }),
		} as ICradle["rateLimiter"],
		logger: silentLogger,
		authConfig: {
			loginWindowS: 60,
			loginMaxPerEmail: 5,
			loginMaxPerIp: 20,
			maxSessionsPerUser: 5,
			refreshGraceS: 60,
		} as ICradle["authConfig"],
		securityStateRepository,
	});

	return { service, calls };
};

describe("createAuthService — lockdown cuts login and refresh", () => {
	test("login fails with PLATFORM_LOCKED under scope 'all' WITHOUT calling compare", async () => {
		const { service, calls } = createHarness(
			snapshotOf({ lockdownAt: new Date(), lockdownScope: "all" }),
		);

		const result = await service.login(
			{ email: "admin@test.com", password: "whatever" },
			{},
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("PLATFORM_LOCKED");
		expect(calls.compare).toBe(0);
	});

	test("login lets SUPERADMIN through under scope 'except-admin' (compare IS called)", async () => {
		const { service, calls } = createHarness(
			snapshotOf({ lockdownAt: new Date(), lockdownScope: "except-admin" }),
		);

		const result = await service.login(
			{ email: "admin@test.com", password: "whatever" },
			{},
		);

		expect(result.success).toBe(true);
		expect(calls.compare).toBe(1);
	});

	test("refresh throws PlatformLockedError", async () => {
		const { service } = createHarness(
			snapshotOf({ lockdownAt: new Date(), lockdownScope: "all" }),
		);

		await expect(service.refresh("raw-refresh-token")).rejects.toBeInstanceOf(
			PlatformLockedError,
		);
	});
});

describe("createAuthService — except-admin blocks non-admins at login", () => {
	// El corte por `except-admin` llega DESPUÉS de resolver el usuario, porque el
	// rol no se conoce antes. El camino es indistinguible en timing del de
	// credenciales inválidas: ya se pagó el mismo bcrypt.compare.
	test("a USER is blocked after paying the same bcrypt compare", async () => {
		const { service, calls } = createHarness(
			snapshotOf({ lockdownAt: new Date(), lockdownScope: "except-admin" }),
			{ role: "USER" },
		);

		const result = await service.login(
			{ email: "admin@test.com", password: "whatever" },
			{},
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("PLATFORM_LOCKED");
		expect(calls.compare).toBe(1);
	});
});
