import { describe, expect, test } from "vitest";
import type { VerifiedAccessTokenPayload } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { FORBIDDEN_ROLE_CODE, HTTP_STATUS } from "@/shared/http/route-error";
import type { Role } from "@/shared/rules/atoms.rules";
import { requireScope } from "../require-scope.server";

const REQUEST = new Request("https://app.example.com/dashboard/usuarios");

const MANAGER_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

const payloadOf = (
	role: Role,
	dependencyId: number | null,
): VerifiedAccessTokenPayload => ({
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role,
	dependencyId,
	isTrainer: false,
	iat: 1_800_000_000,
});

/** Cradle mínimo: la cadena entera solo lee `authPayload`. */
const contextOf = (role: Role | null, dependencyId: number | null = 3) =>
	({
		authPayload: role === null ? null : payloadOf(role, dependencyId),
	}) as unknown as ICradle;

describe("requireScope", () => {
	// La razón de existir: quien acierta el rol no puede olvidar el alcance,
	// porque salen del mismo sitio y en el mismo acto.
	test("devuelve el auth y su alcance juntos", async () => {
		const { auth, scope } = await requireScope(
			REQUEST,
			contextOf("DEPENDENCY_HEAD", 42),
			MANAGER_ROLES,
		);

		expect(auth.role).toBe("DEPENDENCY_HEAD");
		expect(auth.userId).toBe(7);
		expect(scope).toEqual({ kind: "dependency", dependencyId: 42 });
	});

	test("el superadministrador recibe alcance global", async () => {
		const { scope } = await requireScope(
			REQUEST,
			contextOf("SUPERADMIN", null),
			MANAGER_ROLES,
		);

		expect(scope).toEqual({ kind: "global" });
	});

	// Pasa el rol que pide el guard, pero su fila está incompleta: entra a la
	// pantalla y no alcanza ninguna fila. Es lo correcto — el corte por rol y el
	// corte por alcance son decisiones distintas.
	test("un titular sin dependencia entra pero sin alcanzar nada", async () => {
		const { scope } = await requireScope(
			REQUEST,
			contextOf("DEPENDENCY_HEAD", null),
			MANAGER_ROLES,
		);

		expect(scope).toEqual({ kind: "none" });
	});

	// Hereda el corte de requireRole: 403 con los roles exigidos, no un redirect.
	test("un rol insuficiente corta con 403 y sus requiredRoles", async () => {
		const thrown = await requireScope(
			REQUEST,
			contextOf("USER"),
			MANAGER_ROLES,
		).catch((e) => e);

		expect(thrown.init.status).toBe(HTTP_STATUS.FORBIDDEN);
		expect(thrown.data).toEqual({
			code: FORBIDDEN_ROLE_CODE,
			requiredRoles: MANAGER_ROLES,
		});
	});

	test("sin sesión redirige a login, no da 403", async () => {
		const thrown = await requireScope(
			REQUEST,
			contextOf(null),
			MANAGER_ROLES,
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	// La escotilla de requireRole sigue disponible sin reimplementarla.
	test("respeta el redirectTo de requireRole", async () => {
		const thrown = await requireScope(
			REQUEST,
			contextOf("USER"),
			MANAGER_ROLES,
			{
				redirectTo: "/dashboard",
			},
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/dashboard");
	});
});
