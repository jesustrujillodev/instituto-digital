import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from "react-router";
import { describe, expect, test } from "vitest";
import type { VerifiedAccessTokenPayload } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import {
	FORBIDDEN_ROLE_CODE,
	type ForbiddenRoleData,
	HTTP_STATUS,
	isForbiddenRoleError,
} from "@/shared/http/route-error";
import type { Role } from "@/shared/rules/atoms.rules";
import { requireRole } from "../require-role.server";

const REQUEST = new Request("https://app.example.com/usuarios");

const payloadOf = (role: Role): VerifiedAccessTokenPayload => ({
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role,
	dependencyId: 3,
	iat: 1_800_000_000,
});

const contextOf = (role: Role | null) =>
	({
		authPayload: role === null ? null : payloadOf(role),
	}) as unknown as ICradle;

describe("requireRole", () => {
	test("returns the AuthContext when the role is allowed", async () => {
		const auth = await requireRole(REQUEST, contextOf("ADMIN"), ["ADMIN"]);

		expect(auth.role).toBe("ADMIN");
		expect(auth.documentId).toBe("11111111-1111-4111-8111-111111111111");
	});

	test("accepts any role of the allowed list", async () => {
		const auth = await requireRole(REQUEST, contextOf("USER"), [
			"USER",
			"ADMIN",
		]);

		expect(auth.role).toBe("USER");
	});

	// Un 403 dice la verdad: el recurso existe y la sesión es válida, lo que falta
	// es permiso. Además conserva la URL intentada, cosa que un redirect perdería.
	test("throws a 403 — not a redirect — when the role is insufficient", async () => {
		const thrown = await requireRole(REQUEST, contextOf("USER"), [
			"ADMIN",
		]).catch((e) => e);

		expect(thrown.init.status).toBe(HTTP_STATUS.FORBIDDEN);
		expect(thrown.data).toEqual({
			code: FORBIDDEN_ROLE_CODE,
			requiredRoles: ["ADMIN"],
		});
	});

	// Sin statusText explícito, react-router convierte el `data()` lanzado usando
	// "Internal Server Error" y el 403 se pintaría como un error interno.
	test("sets an explicit Forbidden statusText", async () => {
		const thrown = await requireRole(REQUEST, contextOf("USER"), [
			"ADMIN",
		]).catch((e) => e);

		expect(thrown.init.statusText).toBe("Forbidden");
	});

	// El cuerpo que lanza tiene que ser el que `isForbiddenRoleError` reconoce, o
	// el ErrorBoundary mostraría el mensaje genérico del 403 de CSRF.
	test("the thrown payload is recognised by isForbiddenRoleError", async () => {
		const thrown = await requireRole(REQUEST, contextOf("USER"), [
			"ADMIN",
		]).catch((e) => e);

		const asRouteError = new ErrorResponseImpl(
			thrown.init.status,
			thrown.init.statusText,
			thrown.data as ForbiddenRoleData,
		);

		expect(isForbiddenRoleError(asRouteError)).toBe(true);
	});

	// Escotilla OPT-IN: solo los flujos que la piden cambian el corte por un
	// reencaminamiento (p. ej. onboarding incompleto).
	test("redirects instead of cutting when redirectTo is given", async () => {
		const thrown = await requireRole(REQUEST, contextOf("USER"), ["ADMIN"], {
			redirectTo: "/dashboard",
		}).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.status).toBe(302);
		expect(thrown.headers.get("Location")).toBe("/dashboard");
	});

	// Delega en requireAuth: sin sesión el corte es un redirect a login, no un 403.
	// Un 403 le diría a un anónimo que el recurso existe.
	test("delegates to requireAuth when there is no session at all", async () => {
		const thrown = await requireRole(REQUEST, contextOf(null), ["ADMIN"]).catch(
			(e) => e,
		);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	test("an empty allowed list lets nobody through", async () => {
		const thrown = await requireRole(REQUEST, contextOf("ADMIN"), []).catch(
			(e) => e,
		);

		expect(thrown.init.status).toBe(HTTP_STATUS.FORBIDDEN);
	});
});
