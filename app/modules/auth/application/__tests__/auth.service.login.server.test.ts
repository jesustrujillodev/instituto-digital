import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { RateLimitDecision } from "@/shared/rate-limit/rate-limiter";
import type { AuthConfig } from "../../domain/auth.config";
import type { SecuritySnapshot } from "../../domain/security-state.repository";
import { createAuthService } from "../auth.service.server";

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";
const MAX_SESSIONS = 5;

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const snapshotOf = (): SecuritySnapshot => ({
	tokensValidAfter: new Date(0),
	lockdownAt: null,
	lockdownScope: null,
	lockdownReason: null,
	lockdownBy: null,
	userTokensValidAfter: new Map(),
	readAt: new Date(),
});

type FakeUser = {
	id: number;
	documentId: string;
	email: string;
	password: string | null;
	role: string;
	dependencyId: number | null;
	archivedAt: Date | null;
};

const userOf = (overrides: Partial<FakeUser> = {}): FakeUser => ({
	id: 7,
	documentId: "11111111-1111-4111-8111-111111111111",
	email: "ana@empresa.com",
	password: "hash-en-base",
	role: "USER",
	dependencyId: 3,
	archivedAt: null,
	...overrides,
});

/**
 * Dobles mínimos: solo lo que tocan `login`, `logout` y `logoutAll`. El lockdown
 * tiene su propio archivo (auth.service.server.test.ts) y la rotación el suyo.
 */
const createHarness = (
	options: {
		user?: FakeUser | null;
		passwordMatches?: boolean;
		limiterDecisions?: Record<string, RateLimitDecision>;
		session?: { id: string } | null;
	} = {},
) => {
	const calls = {
		compare: 0,
		comparedAgainst: [] as string[],
		consumed: [] as { key: string; limit: number; windowMs: number }[],
		findByEmail: [] as string[],
		created: [] as { userId: number; refreshTokenHash: string }[],
		capped: [] as { userId: number; keep: number }[],
		deleteById: [] as string[],
		deleteAllByUserId: [] as number[],
	};

	const passwordService = {
		hash: async () => "hash-dummy",
		compare: async (_plain: string, hashed: string) => {
			calls.compare += 1;
			calls.comparedAgainst.push(hashed);
			return options.passwordMatches ?? true;
		},
	} as unknown as ICradle["passwordService"];

	const userRepository = {
		findByEmail: async (email: string) => {
			calls.findByEmail.push(email);
			return options.user === undefined ? userOf() : options.user;
		},
		findByInternalId: async () => userOf(),
	} as unknown as ICradle["userRepository"];

	const sessionRepository = {
		create: async (params: { userId: number; refreshTokenHash: string }) => {
			calls.created.push(params);
		},
		deleteOldestExceeding: async (params: { userId: number; keep: number }) => {
			calls.capped.push(params);
		},
		findByTokenHash: async () =>
			options.session === undefined ? { id: SESSION_ID } : options.session,
		deleteById: async (id: string) => {
			calls.deleteById.push(id);
		},
		deleteAllByUserId: async (userId: number) => {
			calls.deleteAllByUserId.push(userId);
		},
	} as unknown as ICradle["sessionRepository"];

	const tokenService = {
		signAccessToken: async () => "access-firmado",
		generateRefreshToken: () => "refresh-crudo",
		hashRefreshToken: (raw: string) => `sha256:${raw}`,
		getRefreshTokenExpiry: () => new Date(Date.now() + 86_400_000),
	} as unknown as ICradle["tokenService"];

	const rateLimiter = {
		consume: (key: string, opts: { limit: number; windowMs: number }) => {
			calls.consumed.push({ key, ...opts });
			return (
				options.limiterDecisions?.[key] ?? { allowed: true, retryAfterMs: 0 }
			);
		},
	} as unknown as ICradle["rateLimiter"];

	const service = createAuthService({
		sessionRepository,
		tokenService,
		userRepository,
		passwordService,
		singleFlight: { run: (_key, _ttl, fn) => fn() } as ICradle["singleFlight"],
		rateLimiter,
		logger: silentLogger,
		authConfig: {
			loginWindowS: 60,
			loginMaxPerEmail: 5,
			loginMaxPerIp: 20,
			maxSessionsPerUser: MAX_SESSIONS,
			refreshGraceS: 60,
		} as AuthConfig,
		securityStateRepository: {
			get: async () => snapshotOf(),
		} as unknown as ICradle["securityStateRepository"],
	});

	return { service, calls };
};

describe("createAuthService — login happy path", () => {
	test("returns the token pair inside the envelope", async () => {
		const { service } = createHarness();

		const result = await service.login(
			{ email: "ana@empresa.com", password: "contrasena1" },
			{},
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({
				accessToken: "access-firmado",
				refreshToken: "refresh-crudo",
			});
		}
	});

	// En la base solo se guarda el HASH del refresh token: el token crudo existe
	// únicamente en la cookie del cliente. Un volcado de `sessions` no es un
	// volcado de credenciales.
	test("persists the HASH of the refresh token, never the raw one", async () => {
		const { service, calls } = createHarness();

		await service.login({ email: "ana@empresa.com", password: "x" }, {});

		expect(calls.created).toHaveLength(1);
		expect(calls.created[0].refreshTokenHash).toBe("sha256:refresh-crudo");
		expect(calls.created[0].refreshTokenHash).not.toBe("refresh-crudo");
	});

	// Cap de sesiones: conserva las N más recientes (incluida la recién creada).
	// Sin él, bots o logins repetidos harían crecer la tabla sin cota.
	test("caps the user's sessions right after creating the new one", async () => {
		const { service, calls } = createHarness();

		await service.login({ email: "ana@empresa.com", password: "x" }, {});

		expect(calls.capped).toEqual([{ userId: 7, keep: MAX_SESSIONS }]);
	});

	test("carries the request metadata into the session", async () => {
		const { service, calls } = createHarness();

		await service.login(
			{ email: "ana@empresa.com", password: "x" },
			{ userAgent: "Mozilla/5.0", ipAddress: "203.0.113.7" },
		);

		expect(calls.created[0]).toMatchObject({
			userAgent: "Mozilla/5.0",
			ipAddress: "203.0.113.7",
		});
	});
});

describe("createAuthService — login rate limiting", () => {
	test("consumes the email limit, and the IP limit only when there is an IP", async () => {
		const { service, calls } = createHarness();

		await service.login(
			{ email: "ana@empresa.com", password: "x" },
			{ ipAddress: "203.0.113.7" },
		);

		expect(calls.consumed.map((c) => c.key)).toEqual([
			"auth:login:email:ana@empresa.com",
			"auth:login:ip:203.0.113.7",
		]);
	});

	// La IP es espoofable sin un proxy de confianza delante, así que el límite
	// estricto es el del email; sin IP no se consume cupo de nadie más.
	test("without an IP only the email limit is consumed", async () => {
		const { service, calls } = createHarness();

		await service.login({ email: "ana@empresa.com", password: "x" }, {});

		expect(calls.consumed).toHaveLength(1);
		expect(calls.consumed[0].key).toBe("auth:login:email:ana@empresa.com");
	});

	test("applies the configured limits and window", async () => {
		const { service, calls } = createHarness();

		await service.login(
			{ email: "ana@empresa.com", password: "x" },
			{ ipAddress: "203.0.113.7" },
		);

		expect(calls.consumed[0]).toMatchObject({ limit: 5, windowMs: 60_000 });
		expect(calls.consumed[1]).toMatchObject({ limit: 20, windowMs: 60_000 });
	});

	test("a blocked email fails with TOO_MANY_ATTEMPTS and the wait", async () => {
		const { service } = createHarness({
			limiterDecisions: {
				"auth:login:email:ana@empresa.com": {
					allowed: false,
					retryAfterMs: 30_000,
				},
			},
		});

		const result = await service.login(
			{ email: "ana@empresa.com", password: "x" },
			{},
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("TOO_MANY_ATTEMPTS");
			expect(result.error.details?.retryAfterMs).toBe(30_000);
		}
	});

	test("a blocked IP also stops the login", async () => {
		const { service } = createHarness({
			limiterDecisions: {
				"auth:login:ip:203.0.113.7": { allowed: false, retryAfterMs: 1000 },
			},
		});

		const result = await service.login(
			{ email: "ana@empresa.com", password: "x" },
			{ ipAddress: "203.0.113.7" },
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("TOO_MANY_ATTEMPTS");
	});

	// El corte llega ANTES de resolver el usuario y de pagar un bcrypt: si no, el
	// rate limit no protegería de lo que más cuesta.
	test("cuts before touching the repository or bcrypt", async () => {
		const { service, calls } = createHarness({
			limiterDecisions: {
				"auth:login:email:ana@empresa.com": {
					allowed: false,
					retryAfterMs: 1000,
				},
			},
		});

		await service.login({ email: "ana@empresa.com", password: "x" }, {});

		expect(calls.findByEmail).toEqual([]);
		expect(calls.compare).toBe(0);
	});
});

describe("createAuthService — login failures", () => {
	// Timing-safe: SIEMPRE se ejecuta un bcrypt.compare, exista o no el usuario.
	// Sin el hash dummy, un correo no registrado respondería antes que uno
	// registrado y el tiempo de respuesta enumeraría cuentas.
	test("an unknown email still pays a bcrypt compare", async () => {
		const { service, calls } = createHarness({ user: null });

		const result = await service.login(
			{ email: "nadie@empresa.com", password: "x" },
			{},
		);

		expect(calls.compare).toBe(1);
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
	});

	test("an account with no password also pays the compare and fails", async () => {
		const { service, calls } = createHarness({
			user: userOf({ password: null }),
		});

		const result = await service.login(
			{ email: "ana@empresa.com", password: "x" },
			{},
		);

		expect(calls.compare).toBe(1);
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
	});

	test("a wrong password fails with the same code as an unknown email", async () => {
		const { service } = createHarness({ passwordMatches: false });

		const result = await service.login(
			{ email: "ana@empresa.com", password: "incorrecta" },
			{},
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
	});

	test("no session is created when the credentials do not check out", async () => {
		const { service, calls } = createHarness({ passwordMatches: false });

		await service.login({ email: "ana@empresa.com", password: "x" }, {});

		expect(calls.created).toEqual([]);
		expect(calls.capped).toEqual([]);
	});

	test("compares against the stored hash when the user exists", async () => {
		const { service, calls } = createHarness();

		await service.login({ email: "ana@empresa.com", password: "x" }, {});

		expect(calls.comparedAgainst).toEqual(["hash-en-base"]);
	});
});

describe("createAuthService — logout", () => {
	test("deletes the session that owns the refresh token", async () => {
		const { service, calls } = createHarness();

		const result = await service.logout("refresh-crudo");

		expect(result.success).toBe(true);
		expect(calls.deleteById).toEqual([SESSION_ID]);
	});

	// Idempotente: cerrar una sesión ya revocada no es un fallo. Lo que sí puede
	// fallar es la base, y entonces la respuesta lo dice en vez de obligar al
	// action a rodearlo de un try/catch.
	test("is idempotent when the session is already gone", async () => {
		const { service, calls } = createHarness({ session: null });

		const result = await service.logout("refresh-crudo");

		expect(result.success).toBe(true);
		expect(calls.deleteById).toEqual([]);
	});
});

describe("createAuthService — logoutAll", () => {
	test("revokes every session of the user", async () => {
		const { service, calls } = createHarness();

		const result = await service.logoutAll(7);

		expect(result.success).toBe(true);
		expect(calls.deleteAllByUserId).toEqual([7]);
	});
});

describe("createAuthService — cuenta archivada", () => {
	const LOGIN_DTO = { email: "ana@empresa.com", password: "contrasena1" };

	// El hueco que este PRD cierra: `archivedAt` no se comprobaba en ningún punto
	// de autenticación, así que una cuenta desactivada seguía entrando.
	test("una cuenta archivada no inicia sesión ni con la contraseña correcta", async () => {
		const { service } = createHarness({
			user: userOf({ archivedAt: new Date() }),
			passwordMatches: true,
		});

		const result = await service.login(LOGIN_DTO, {});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("INVALID_CREDENTIALS");
		}
	});

	// Un código propio viajaría al cliente y sería un oráculo: "esta cuenta existe
	// pero está desactivada". La copia es la misma que la de una contraseña mal
	// puesta.
	test("responde lo mismo que una contraseña incorrecta", async () => {
		const archivada = createHarness({
			user: userOf({ archivedAt: new Date() }),
			passwordMatches: true,
		});
		const malaContrasena = createHarness({ passwordMatches: false });

		const [a, b] = await Promise.all([
			archivada.service.login(LOGIN_DTO, {}),
			malaContrasena.service.login(LOGIN_DTO, {}),
		]);

		expect(a.success).toBe(false);
		expect(b.success).toBe(false);
		if (!a.success && !b.success) {
			expect(a.error.code).toBe(b.error.code);
			expect(a.error.message).toBe(b.error.message);
		}
	});

	// Se comprueba DESPUÉS del bcrypt.compare: cortar antes ahorraría el hash y
	// haría que una cuenta desactivada respondiera más rápido que una activa.
	test("paga el mismo bcrypt.compare que una cuenta activa", async () => {
		const { service, calls } = createHarness({
			user: userOf({ archivedAt: new Date() }),
			passwordMatches: true,
		});

		await service.login(LOGIN_DTO, {});

		expect(calls.compare).toBe(1);
	});

	test("no crea sesión para una cuenta archivada", async () => {
		const { service, calls } = createHarness({
			user: userOf({ archivedAt: new Date() }),
			passwordMatches: true,
		});

		await service.login(LOGIN_DTO, {});

		expect(calls.created).toEqual([]);
	});
});
