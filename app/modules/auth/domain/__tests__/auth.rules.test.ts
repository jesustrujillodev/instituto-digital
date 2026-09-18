import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	accessTokenPayloadSchema,
	authRules,
	listSessionsRule,
	lockdownRule,
	loginRule,
	revokeSessionRule,
	revokeUserSessionsRule,
	SESSION_SORT_FIELDS,
	SESSION_STATUSES,
	sessionSchema,
	verifiedAccessTokenPayloadSchema,
} from "../auth.rules";

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";

const rawSessionOf = (overrides: Record<string, unknown> = {}) => ({
	id: SESSION_ID,
	userId: 7,
	refreshTokenHash: "a".repeat(64),
	prevTokenHash: null,
	rotatedAt: null,
	userAgent: "Mozilla/5.0",
	ipAddress: "203.0.113.7",
	expiresAt: new Date("2026-08-10T00:00:00.000Z"),
	createdAt: new Date("2026-08-03T00:00:00.000Z"),
	updatedAt: new Date("2026-08-03T00:00:00.000Z"),
	...overrides,
});

describe("sessionSchema", () => {
	test("accepts a full row", () => {
		expect(v.safeParse(sessionSchema, rawSessionOf()).success).toBe(true);
	});

	test("accepts the nullable columns as null", () => {
		const result = v.safeParse(
			sessionSchema,
			rawSessionOf({
				prevTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
			}),
		);

		expect(result.success).toBe(true);
	});

	test("rejects a row with a missing date", () => {
		const { expiresAt: _, ...withoutExpiry } = rawSessionOf();

		expect(v.safeParse(sessionSchema, withoutExpiry).success).toBe(false);
	});

	// Las fechas llegan como Date de Prisma, no como string ISO: parsear un string
	// aquí escondería un mapper que no convirtió.
	test("rejects an ISO string where a Date is expected", () => {
		const result = v.safeParse(
			sessionSchema,
			rawSessionOf({ expiresAt: "2026-08-10T00:00:00.000Z" }),
		);

		expect(result.success).toBe(false);
	});
});

describe("loginRule", () => {
	test("accepts a well-formed credential pair", () => {
		const result = v.safeParse(loginRule, {
			email: "ana@empresa.com",
			password: "cualquiera",
		});

		expect(result.success).toBe(true);
	});

	// En el login la política de contraseña NO se aplica: solo "no vacía". Exigir
	// aquí los 8 caracteres le diría al atacante qué ni vale la pena probar.
	test("does not apply the password policy — only non-empty", () => {
		expect(
			v.safeParse(loginRule, { email: "ana@empresa.com", password: "x" })
				.success,
		).toBe(true);
		expect(
			v.safeParse(loginRule, { email: "ana@empresa.com", password: "" })
				.success,
		).toBe(false);
	});

	test("rejects a malformed email", () => {
		expect(
			v.safeParse(loginRule, { email: "ana", password: "cualquiera" }).success,
		).toBe(false);
	});
});

describe("accessTokenPayloadSchema", () => {
	const payload = {
		sub: "11111111-1111-4111-8111-111111111111",
		userId: 7,
		email: "ana@empresa.com",
		role: "SUPERADMIN",
		dependencyId: null,
		isTrainer: false,
	};

	test("accepts a valid payload", () => {
		expect(v.safeParse(accessTokenPayloadSchema, payload).success).toBe(true);
	});

	// Es lo que impide FIRMAR un token con un rol inventado: el payload se valida
	// contra el picklist compartido antes de acuñarse.
	test("rejects a role outside the shared tuple", () => {
		expect(
			v.safeParse(accessTokenPayloadSchema, { ...payload, role: "OWNER" })
				.success,
		).toBe(false);
	});

	// `iat` no aparece porque en el momento de firmar aún no existe: lo pone jose
	// con setIssuedAt, no el llamador.
	test("does not require iat — it does not exist yet at signing time", () => {
		expect(v.safeParse(accessTokenPayloadSchema, payload).success).toBe(true);
	});
});

describe("verifiedAccessTokenPayloadSchema", () => {
	const verified = {
		sub: "11111111-1111-4111-8111-111111111111",
		userId: 7,
		email: "ana@empresa.com",
		role: "USER",
		dependencyId: 3,
		isTrainer: false,
		iat: 1_800_000_000,
	};

	test("accepts a payload that carries iat", () => {
		expect(
			v.safeParse(verifiedAccessTokenPayloadSchema, verified).success,
		).toBe(true);
	});

	// Sin `iat` no hay nada que comparar contra el epoch de validez. Un token
	// inevaluable se rechaza ENTERO en vez de dejarlo pasar sin comprobar: es la
	// diferencia entre fallar hacia cerrado y abrir la plataforma.
	test("REJECTS a payload without iat", () => {
		const { iat: _, ...withoutIat } = verified;

		expect(
			v.safeParse(verifiedAccessTokenPayloadSchema, withoutIat).success,
		).toBe(false);
	});

	test("requires iat to be an integer number of seconds", () => {
		expect(
			v.safeParse(verifiedAccessTokenPayloadSchema, { ...verified, iat: 1.5 })
				.success,
		).toBe(false);
		expect(
			v.safeParse(verifiedAccessTokenPayloadSchema, {
				...verified,
				iat: "1800000000",
			}).success,
		).toBe(false);
	});
});

describe("listSessionsRule", () => {
	test("accepts an empty filter", () => {
		expect(v.safeParse(listSessionsRule, {}).success).toBe(true);
	});

	test("accepts the three supported statuses", () => {
		for (const status of SESSION_STATUSES) {
			expect(v.safeParse(listSessionsRule, { status }).success).toBe(true);
		}
	});

	// sortBy acaba en un `orderBy` de Prisma: es una allowlist, no una sugerencia.
	// Sin ella, el query string elegiría por qué columna ordenar.
	test("only allows the whitelisted sort columns", () => {
		for (const sortBy of SESSION_SORT_FIELDS) {
			expect(v.safeParse(listSessionsRule, { sortBy }).success).toBe(true);
		}
		expect(
			v.safeParse(listSessionsRule, { sortBy: "refreshTokenHash" }).success,
		).toBe(false);
	});

	test("rejects an unknown status and an unknown sort direction", () => {
		expect(v.safeParse(listSessionsRule, { status: "raro" }).success).toBe(
			false,
		);
		expect(v.safeParse(listSessionsRule, { sortDir: "arriba" }).success).toBe(
			false,
		);
	});

	test("inherits the shared pagination cap", () => {
		expect(v.safeParse(listSessionsRule, { pageSize: 101 }).success).toBe(
			false,
		);
	});

	test("userId must be a positive integer", () => {
		expect(v.safeParse(listSessionsRule, { userId: 7 }).success).toBe(true);
		expect(v.safeParse(listSessionsRule, { userId: 0 }).success).toBe(false);
		expect(v.safeParse(listSessionsRule, { userId: 1.5 }).success).toBe(false);
	});
});

describe("revokeSessionRule", () => {
	test("accepts a uuid", () => {
		expect(
			v.safeParse(revokeSessionRule, { sessionId: SESSION_ID }).success,
		).toBe(true);
	});

	// El id público es un uuid; un hash NUNCA sale del servidor, así que aceptar
	// cualquier string aquí abriría la puerta a probar formas que no deberían
	// llegar al repositorio.
	test("rejects anything that is not a uuid", () => {
		expect(v.safeParse(revokeSessionRule, { sessionId: "1" }).success).toBe(
			false,
		);
		expect(
			v.safeParse(revokeSessionRule, { sessionId: "a".repeat(64) }).success,
		).toBe(false);
	});
});

describe("revokeUserSessionsRule", () => {
	test("accepts a positive integer id", () => {
		expect(v.safeParse(revokeUserSessionsRule, { userId: 7 }).success).toBe(
			true,
		);
	});

	test("rejects zero, negatives and decimals", () => {
		expect(v.safeParse(revokeUserSessionsRule, { userId: 0 }).success).toBe(
			false,
		);
		expect(v.safeParse(revokeUserSessionsRule, { userId: -1 }).success).toBe(
			false,
		);
		expect(v.safeParse(revokeUserSessionsRule, { userId: 1.5 }).success).toBe(
			false,
		);
	});
});

describe("lockdownRule", () => {
	const valid = { scope: "all", confirmation: "CERRAR" };

	test("accepts both scopes", () => {
		expect(v.safeParse(lockdownRule, valid).success).toBe(true);
		expect(
			v.safeParse(lockdownRule, { ...valid, scope: "except-admin" }).success,
		).toBe(true);
	});

	// Confirmación reforzada: se escribe la palabra. Es la acción más destructiva
	// del sistema y la única que lo exige, así que el literal es parte de la regla
	// y no de la UI.
	test("requires the exact confirmation word", () => {
		expect(
			v.safeParse(lockdownRule, { ...valid, confirmation: "cerrar" }).success,
		).toBe(false);
		expect(
			v.safeParse(lockdownRule, { ...valid, confirmation: "SI" }).success,
		).toBe(false);
		expect(v.safeParse(lockdownRule, { scope: "all" }).success).toBe(false);
	});

	test("rejects an unknown scope", () => {
		expect(
			v.safeParse(lockdownRule, { ...valid, scope: "except-user" }).success,
		).toBe(false);
	});

	test("reason is optional and capped at 500 characters", () => {
		expect(v.safeParse(lockdownRule, valid).success).toBe(true);
		expect(
			v.safeParse(lockdownRule, { ...valid, reason: "a".repeat(500) }).success,
		).toBe(true);
		expect(
			v.safeParse(lockdownRule, { ...valid, reason: "a".repeat(501) }).success,
		).toBe(false);
	});
});

describe("authRules", () => {
	test("exposes every rule the module validates against", () => {
		expect(Object.keys(authRules).sort()).toEqual([
			"accessTokenPayload",
			"listSessions",
			"lockdown",
			"login",
			"revokeSession",
			"revokeUserSessions",
			"verifiedAccessTokenPayload",
		]);
	});
});
