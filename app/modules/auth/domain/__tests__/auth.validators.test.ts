import { describe, expect, test } from "vitest";
import {
	validateAccessTokenPayload,
	validateListSessions,
	validateLockdown,
	validateLogin,
	validateRevokeSession,
	validateRevokeUserSessions,
	validateVerifiedAccessTokenPayload,
} from "../auth.validators";

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";

const verifiedPayload = {
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role: "USER",
	dependencyId: 3,
	iat: 1_800_000_000,
};

describe("validateLogin", () => {
	test("returns the parsed dto", () => {
		const dto = validateLogin({
			email: "Ana@Empresa.com",
			password: "cualquiera",
		});

		expect(dto.email).toBe("ana@empresa.com");
		expect(dto.password).toBe("cualquiera");
	});

	test("throws on a malformed email", () => {
		expect(() => validateLogin({ email: "ana", password: "x" })).toThrow();
	});
});

describe("validateAccessTokenPayload", () => {
	test("returns the payload that will be signed", () => {
		const { iat: _, ...toSign } = verifiedPayload;

		expect(validateAccessTokenPayload(toSign)).toEqual(toSign);
	});

	test("throws on a role outside the shared tuple", () => {
		const { iat: _, ...toSign } = verifiedPayload;

		expect(() =>
			validateAccessTokenPayload({ ...toSign, role: "OWNER" }),
		).toThrow();
	});
});

describe("validateVerifiedAccessTokenPayload", () => {
	test("returns the payload when iat is present", () => {
		expect(validateVerifiedAccessTokenPayload(verifiedPayload)).toEqual(
			verifiedPayload,
		);
	});

	// Lanza a propósito: sin `iat` no hay nada que comparar contra el epoch, y el
	// verificador convierte ese throw en `null` — inevaluable se trata como
	// inválido, nunca como válido.
	test("throws when iat is missing", () => {
		const { iat: _, ...withoutIat } = verifiedPayload;

		expect(() => validateVerifiedAccessTokenPayload(withoutIat)).toThrow();
	});

	test("throws when iat is not an integer", () => {
		expect(() =>
			validateVerifiedAccessTokenPayload({ ...verifiedPayload, iat: 1.5 }),
		).toThrow();
	});
});

describe("validateListSessions", () => {
	test("returns the parsed filters", () => {
		expect(validateListSessions({ status: "active", page: 2 })).toEqual({
			status: "active",
			page: 2,
		});
	});

	test("accepts an empty filter", () => {
		expect(validateListSessions({})).toEqual({});
	});

	test("throws on a sort column outside the allowlist", () => {
		expect(() =>
			validateListSessions({ sortBy: "refreshTokenHash" }),
		).toThrow();
	});
});

describe("validateRevokeSession", () => {
	test("returns the parsed session id", () => {
		expect(validateRevokeSession({ sessionId: SESSION_ID })).toEqual({
			sessionId: SESSION_ID,
		});
	});

	test("throws when the id is not a uuid", () => {
		expect(() => validateRevokeSession({ sessionId: "1" })).toThrow();
	});
});

describe("validateRevokeUserSessions", () => {
	test("returns the parsed user id", () => {
		expect(validateRevokeUserSessions({ userId: 7 })).toEqual({ userId: 7 });
	});

	test("throws on a non-positive id", () => {
		expect(() => validateRevokeUserSessions({ userId: 0 })).toThrow();
	});
});

describe("validateLockdown", () => {
	test("returns the parsed dto", () => {
		expect(
			validateLockdown({
				scope: "except-admin",
				confirmation: "CERRAR",
				reason: "incidente",
			}),
		).toEqual({
			scope: "except-admin",
			confirmation: "CERRAR",
			reason: "incidente",
		});
	});

	test("throws without the exact confirmation word", () => {
		expect(() =>
			validateLockdown({ scope: "all", confirmation: "cerrar" }),
		).toThrow();
	});
});
