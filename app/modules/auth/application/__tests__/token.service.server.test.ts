import { afterEach, describe, expect, test, vi } from "vitest";
import type { AuthConfig } from "../../domain/auth.config";
import type { AccessTokenPayload } from "../../domain/auth.types";
import { createTokenService } from "../token.service.server";

const configOf = (overrides: Partial<AuthConfig> = {}): AuthConfig => ({
	jwtSecret: "un-secreto-de-al-menos-32-caracteres-para-hs256",
	accessTokenTtlS: 300,
	refreshTokenTtlS: 7 * 24 * 60 * 60,
	refreshGraceS: 60,
	issuer: "car-dealership",
	audience: "car-dealership",
	loginMaxPerEmail: 5,
	loginMaxPerIp: 20,
	loginWindowS: 60,
	maxSessionsPerUser: 5,
	securityStateCacheTtlS: 5,
	...overrides,
});

const PAYLOAD: AccessTokenPayload = {
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role: "ADMIN",
	dependencyId: null,
	isTrainer: false,
};

afterEach(() => {
	vi.useRealTimers();
});

describe("createTokenService — sign and verify", () => {
	test("round-trips the payload", async () => {
		const service = createTokenService({ authConfig: configOf() });

		const token = await service.signAccessToken(PAYLOAD);
		const verified = await service.verifyAccessToken(token);

		expect(verified).toMatchObject(PAYLOAD);
	});

	// `iat` lo pone jose al firmar, no el llamador — y es obligatorio en el
	// payload verificado porque es lo que se compara contra el epoch de validez.
	test("stamps an integer iat in seconds", async () => {
		const service = createTokenService({ authConfig: configOf() });

		const verified = await service.verifyAccessToken(
			await service.signAccessToken(PAYLOAD),
		);

		expect(Number.isInteger(verified?.iat)).toBe(true);
		expect(verified?.iat).toBeGreaterThan(1_700_000_000);
	});

	test("returns null for a garbage token", async () => {
		const service = createTokenService({ authConfig: configOf() });

		expect(await service.verifyAccessToken("no-es-un-jwt")).toBeNull();
		expect(await service.verifyAccessToken("")).toBeNull();
	});

	// Un token firmado con otro secreto no vale aunque su forma sea correcta: es
	// lo único que impide que cualquiera se acuñe un rol ADMIN.
	test("returns null for a token signed with another secret", async () => {
		const mine = createTokenService({ authConfig: configOf() });
		const theirs = createTokenService({
			authConfig: configOf({
				jwtSecret: "OTRO-secreto-de-al-menos-32-caracteres!!",
			}),
		});

		const foreign = await theirs.signAccessToken(PAYLOAD);

		expect(await mine.verifyAccessToken(foreign)).toBeNull();
	});

	test("returns null when the signature was tampered with", async () => {
		const service = createTokenService({ authConfig: configOf() });
		const token = await service.signAccessToken(PAYLOAD);

		const [header, body] = token.split(".");

		expect(
			await service.verifyAccessToken(`${header}.${body}.firmaInventada`),
		).toBeNull();
	});

	// Issuer y audience fijados: un token emitido para OTRO entorno (staging) o
	// para otra app no vale aquí, aunque compartan el secreto por descuido.
	test("returns null for a token issued for another issuer or audience", async () => {
		const service = createTokenService({ authConfig: configOf() });
		const otherIssuer = createTokenService({
			authConfig: configOf({ issuer: "staging" }),
		});
		const otherAudience = createTokenService({
			authConfig: configOf({ audience: "otra-app" }),
		});

		expect(
			await service.verifyAccessToken(
				await otherIssuer.signAccessToken(PAYLOAD),
			),
		).toBeNull();
		expect(
			await service.verifyAccessToken(
				await otherAudience.signAccessToken(PAYLOAD),
			),
		).toBeNull();
	});

	test("returns null once the token has expired", async () => {
		const service = createTokenService({
			authConfig: configOf({ accessTokenTtlS: 60 }),
		});
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
		const token = await service.signAccessToken(PAYLOAD);

		vi.setSystemTime(new Date("2026-08-03T12:02:00.000Z"));

		expect(await service.verifyAccessToken(token)).toBeNull();
	});

	test("still accepts the token just before it expires", async () => {
		const service = createTokenService({
			authConfig: configOf({ accessTokenTtlS: 300 }),
		});
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
		const token = await service.signAccessToken(PAYLOAD);

		vi.setSystemTime(new Date("2026-08-03T12:04:00.000Z"));

		expect(await service.verifyAccessToken(token)).toMatchObject(PAYLOAD);
	});

	// Reparto de responsabilidades: FIRMAR no valida —el servicio de auth ya lo
	// hizo en buildPayload—, pero VERIFICAR sí. Así un token con un rol fuera de la
	// tupla, aunque esté correctamente firmado con nuestro secreto, no autentica:
	// una firma válida no garantiza que el contenido sea el esperado.
	test("a correctly signed token with an unknown role fails verification", async () => {
		const service = createTokenService({ authConfig: configOf() });

		const token = await service.signAccessToken({
			...PAYLOAD,
			role: "OWNER",
		} as unknown as AccessTokenPayload);

		expect(await service.verifyAccessToken(token)).toBeNull();
	});

	test("the token carries no secret beyond the declared claims", async () => {
		const service = createTokenService({ authConfig: configOf() });

		const token = await service.signAccessToken(PAYLOAD);
		const body = JSON.parse(
			Buffer.from(token.split(".")[1], "base64url").toString(),
		);

		expect(Object.keys(body).sort()).toEqual([
			"aud",
			"dependencyId",
			"email",
			"exp",
			"iat",
			"isTrainer",
			"iss",
			"role",
			"sub",
			"userId",
		]);
	});
});

describe("createTokenService — refresh tokens", () => {
	// El refresh token NO transporta datos: es un identificador aleatorio, y la
	// sesión vive entera en la base (y solo como hash).
	test("generates 128 hex characters of randomness", () => {
		const service = createTokenService({ authConfig: configOf() });

		const token = service.generateRefreshToken();

		expect(token).toHaveLength(128);
		expect(token).toMatch(/^[0-9a-f]+$/);
	});

	test("two generated tokens never collide", () => {
		const service = createTokenService({ authConfig: configOf() });

		const tokens = new Set(
			Array.from({ length: 50 }, () => service.generateRefreshToken()),
		);

		expect(tokens.size).toBe(50);
	});

	// Determinista porque el hash ES la clave de búsqueda en la base y la de
	// idempotencia del single-flight: si variara, ninguna rotación se encontraría.
	test("hashing is deterministic and yields sha256 hex", () => {
		const service = createTokenService({ authConfig: configOf() });

		const hash = service.hashRefreshToken("token-crudo");

		expect(hash).toBe(service.hashRefreshToken("token-crudo"));
		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});

	test("different tokens hash differently", () => {
		const service = createTokenService({ authConfig: configOf() });

		expect(service.hashRefreshToken("a")).not.toBe(
			service.hashRefreshToken("b"),
		);
	});

	// El hash no debe permitir recuperar el token: es lo que hace que un volcado
	// de la tabla de sesiones no sea un volcado de credenciales.
	test("the hash never contains the raw token", () => {
		const service = createTokenService({ authConfig: configOf() });

		expect(service.hashRefreshToken("token-crudo")).not.toContain(
			"token-crudo",
		);
	});

	test("derives the expiry from the configured TTL", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
		const service = createTokenService({
			authConfig: configOf({ refreshTokenTtlS: 3600 }),
		});

		expect(service.getRefreshTokenExpiry()).toEqual(
			new Date("2026-08-03T13:00:00.000Z"),
		);
	});
});
