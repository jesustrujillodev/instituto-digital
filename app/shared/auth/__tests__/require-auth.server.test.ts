import { describe, expect, test } from "vitest";
import type { VerifiedAccessTokenPayload } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { requireAuth } from "../require-auth.server";

const REQUEST = new Request("https://app.example.com/dashboard");

const payloadOf = (
	overrides: Partial<VerifiedAccessTokenPayload> = {},
): VerifiedAccessTokenPayload => ({
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	mustChangePassword: false,
	iat: 1_800_000_000,
	...overrides,
});

/** Cradle mínimo: `requireAuth` solo lee `authPayload`. */
const contextOf = (authPayload: VerifiedAccessTokenPayload | null) =>
	({ authPayload }) as unknown as ICradle;

describe("requireAuth", () => {
	// Proyecta la identidad al vocabulario del dominio: `sub` es el id público y
	// pasa a llamarse `documentId`, que es como lo nombra el resto del sistema.
	test("projects the verified payload into an AuthContext", async () => {
		const auth = await requireAuth(REQUEST, contextOf(payloadOf()));

		expect(auth).toEqual({
			userId: 7,
			documentId: "11111111-1111-4111-8111-111111111111",
			email: "ana@empresa.com",
			role: "USER",
			dependencyId: 3,
			isTrainer: false,
			mustChangePassword: false,
		});
	});

	// No re-verifica el token: configureContainer ya lo validó (firma, epoch y
	// silent refresh) antes de que el loader corriera.
	test("does not leak the raw claims — no iat in the AuthContext", async () => {
		const auth = await requireAuth(REQUEST, contextOf(payloadOf()));

		expect(auth).not.toHaveProperty("iat");
		expect(auth).not.toHaveProperty("sub");
	});

	// Remediación (Fase C): la contraseña que puso otra persona se cambia antes
	// de usar la plataforma.
	test("con un cambio de contraseña pendiente redirige a «Mi perfil»", async () => {
		const thrown = await requireAuth(
			REQUEST,
			contextOf(payloadOf({ mustChangePassword: true })),
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).headers.get("Location")).toBe(
			"/dashboard/perfil",
		);
	});

	test("con el cambio pendiente sí deja entrar a «Mi perfil»", async () => {
		const auth = await requireAuth(
			new Request("https://app.example.com/dashboard/perfil.data"),
			contextOf(payloadOf({ mustChangePassword: true })),
		);

		expect(auth.mustChangePassword).toBe(true);
	});

	test("throws a redirect to the login page when there is no payload", async () => {
		const thrown = await requireAuth(REQUEST, contextOf(null)).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(302);
		expect((thrown as Response).headers.get("Location")).toBe(
			"/iniciar-sesion",
		);
	});

	test("carries the role through untouched", async () => {
		const auth = await requireAuth(
			REQUEST,
			contextOf(payloadOf({ role: "SUPERADMIN" })),
		);

		expect(auth.role).toBe("SUPERADMIN");
	});
});
