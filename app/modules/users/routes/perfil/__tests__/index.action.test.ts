import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	INTENT_FIELD,
	USER_INTENTS,
} from "../../../utils/parse-user-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const DEPENDENCY_ID = "22222222-2222-4222-8222-222222222222";

const formRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request("https://app.example.com/dashboard/perfil", {
		method: "POST",
		body,
	});
};

const okOf = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

const failOf = (code: string) => ({
	success: false as const,
	error: { code, message: "técnico" },
	timestamp: new Date().toISOString(),
});

const createHarness = (
	options: { role?: Role | null; passwordFails?: string } = {},
) => {
	const calls = {
		password: [] as unknown[],
		dependency: [] as unknown[],
	};

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: DOCUMENT_ID,
						userId: 7,
						email: "ana@instituto.gob.mx",
						role: options.role ?? "USER",
						dependencyId: 3,
						iat: 1_800_000_000,
					},
		userService: {
			changeOwnPassword: async (dto: unknown, actor: unknown) => {
				calls.password.push({ dto, actor });
				return options.passwordFails
					? failOf(options.passwordFails)
					: okOf(null);
			},
			changeDependency: async (
				documentId: string,
				dependency: string,
				actor: unknown,
			) => {
				calls.dependency.push({ documentId, dependency, actor });
				return okOf({ documentId });
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

const VALID_PASSWORD = {
	currentPassword: "vieja1",
	newPassword: "contrasena1",
	confirmPassword: "contrasena1",
	[INTENT_FIELD]: USER_INTENTS.changePassword,
};

describe("perfil action — contraseña", () => {
	test("cambia la contraseña propia y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest(VALID_PASSWORD), context);

		expect(result.success && result.message).toBe("Contraseña actualizada");
		expect(calls.password).toHaveLength(1);
	});

	// La regla exige la confirmación y la compara: sin eso, un error de tecleo
	// dejaría a la persona fuera de su propia cuenta.
	test("una confirmación que no coincide falla sin llegar al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ ...VALID_PASSWORD, confirmPassword: "otra1234" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.password).toEqual([]);
	});

	test("una contraseña nueva demasiado corta falla en la frontera", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				...VALID_PASSWORD,
				newPassword: "corta",
				confirmPassword: "corta",
			}),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.password).toEqual([]);
	});

	test("la contraseña actual incorrecta responde con su copia", async () => {
		const { context } = createHarness({
			passwordFails: "INVALID_CURRENT_PASSWORD",
		});

		const result = await run(formRequest(VALID_PASSWORD), context);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.fieldErrors).toEqual({
				currentPassword: "La contraseña actual no es correcta",
			});
		}
	});
});

describe("perfil action — guard e intenciones", () => {
	test("sin sesión redirige a login", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(formRequest(VALID_PASSWORD), context).catch(
			(e) => e,
		);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	// Fail-closed: una intención administrativa no se ejecuta desde aquí por
	// parecerse a una propia.
	test("una intención administrativa no se acepta en el perfil", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ [INTENT_FIELD]: USER_INTENTS.archive }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual({ password: [], dependency: [] });
	});

	// La adscripción la decide quien administra, desde la edición del usuario.
	test("nadie se cambia de dependencia desde su perfil", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				dependency: DEPENDENCY_ID,
				[INTENT_FIELD]: USER_INTENTS.changeDependency,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.dependency).toEqual([]);
	});

	test("sin intención falla igual", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest({}), context);

		expect(result.success).toBe(false);
		expect(calls).toEqual({ password: [], dependency: [] });
	});
});
