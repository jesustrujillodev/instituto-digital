import { describe, expect, test } from "vitest";
import type { AppResponse } from "@/shared/response/response.types";
import type { AuthTokens } from "../../../domain/auth.types";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const formRequest = (
	fields: Record<string, string>,
	init: RequestInit = {},
): Request => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request("https://app.example.com/iniciar-sesion", {
		method: "POST",
		body,
		...init,
	});
};

/** Cradle mínimo: el action solo toca `authService.login`. */
const createHarness = (
	result: AppResponse<AuthTokens> = {
		success: true,
		data: { accessToken: "at", refreshToken: "rt" },
		timestamp: new Date().toISOString(),
	},
) => {
	const calls = { login: [] as unknown[] };

	const context = {
		authService: {
			login: async (dto: unknown, meta: unknown) => {
				calls.login.push({ dto, meta });
				return result;
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("iniciar-sesion action — redirectTo", () => {
	// `loginRule` es un `v.object` no-strict: el campo extra pasa la validación
	// pero se descarta, de ahí que el action lo lea del formData crudo.
	test("vuelve al escaneo del QR cuando el destino casa con la allowlist", async () => {
		const { context } = createHarness();

		const thrown = await run(
			formRequest({
				email: "ana@empresa.com",
				password: "contrasena1",
				redirectTo: `/asistencia/${TOKEN}`,
			}),
			context,
		).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(`/asistencia/${TOKEN}`);
	});

	test.each([
		"https://evil.com",
		"//evil.com",
		"/dashboard/usuarios",
		`/asistencia/${TOKEN}?next=/admin`,
	])("ignora el destino hostil %s", async (redirectTo) => {
		const { context } = createHarness();

		const thrown = await run(
			formRequest({
				email: "ana@empresa.com",
				password: "contrasena1",
				redirectTo,
			}),
			context,
		).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe("/dashboard");
	});
});

describe("iniciar-sesion action — success", () => {
	// El éxito NO devuelve envelope: es un redirect con las cookies de sesión, y
	// la pantalla de login deja de existir. Solo el fallo tiene forma de respuesta.
	test("throws a redirect to the dashboard carrying the session cookies", async () => {
		const { context } = createHarness();

		const thrown = await run(
			formRequest({ email: "ana@empresa.com", password: "contrasena1" }),
			context,
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/dashboard");
		const cookies = thrown.headers.getSetCookie();
		expect(cookies.some((c: string) => c.includes("__access_token="))).toBe(
			true,
		);
		expect(cookies.some((c: string) => c.includes("__refresh_token="))).toBe(
			true,
		);
	});

	// El user-agent y la IP acaban en la fila de la sesión: son informativos (el
	// monitor los pinta), pero tienen que llegar.
	test("forwards the user agent and the validated client IP", async () => {
		const { context, calls } = createHarness();

		await run(
			formRequest(
				{ email: "ana@empresa.com", password: "x" },
				{
					headers: {
						"User-Agent": "Mozilla/5.0",
						"X-Forwarded-For": "203.0.113.7, 70.41.3.18",
					},
				},
			),
			context,
		).catch(() => {});

		expect(calls.login[0]).toMatchObject({
			meta: { userAgent: "Mozilla/5.0", ipAddress: "203.0.113.7" },
		});
	});

	// La IP se valida antes de viajar: un header falsificado con basura no se
	// persiste, se descarta.
	test("drops a forged, non-IP forwarded header", async () => {
		const { context, calls } = createHarness();

		await run(
			formRequest(
				{ email: "ana@empresa.com", password: "x" },
				{ headers: { "X-Forwarded-For": "<script>" } },
			),
			context,
		).catch(() => {});

		expect(
			(calls.login[0] as { meta: { ipAddress?: string } }).meta.ipAddress,
		).toBeUndefined();
	});

	test("normalises the email before handing it to the service", async () => {
		const { context, calls } = createHarness();

		await run(
			formRequest({ email: "Ana@Empresa.COM", password: "x" }),
			context,
		).catch(() => {});

		expect(calls.login[0]).toMatchObject({
			dto: { email: "ana@empresa.com" },
		});
	});
});

describe("iniciar-sesion action — failure", () => {
	// La validación de frontera corta ANTES de llamar al servicio: no se gasta un
	// bcrypt ni un cupo del rate limiter en un formulario mal formado.
	test("an invalid input never reaches the service", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ email: "ana", password: "x" }),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.login).toEqual([]);
	});

	// Y responde con la MISMA copia que un fallo de credenciales: distinguirlas
	// convertiría el formulario en un oráculo para enumerar cuentas.
	test("a malformed email reads exactly like wrong credentials", async () => {
		const { context } = createHarness();

		const invalid = await run(
			formRequest({ email: "ana", password: "x" }),
			context,
		);
		const wrong = await run(
			formRequest({ email: "ana@empresa.com", password: "x" }),
			createHarness({
				success: false,
				error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
				timestamp: new Date().toISOString(),
			}).context,
		);

		expect(!invalid.success && invalid.error.message).toBe(
			!wrong.success && wrong.error.message,
		);
	});

	// El código NO se traduce: es lo que permite al cliente distinguir el caso sin
	// comparar strings de UI. Lo que cambia es el mensaje.
	test("localises the service failure keeping its stable code", async () => {
		const { context } = createHarness({
			success: false,
			error: {
				code: "TOO_MANY_ATTEMPTS",
				message: "Too many attempts",
				details: { retryAfterMs: 30_000 },
			},
			timestamp: new Date().toISOString(),
		});

		const result = await run(
			formRequest({ email: "ana@empresa.com", password: "x" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("TOO_MANY_ATTEMPTS");
			expect(result.error.message).toBe(
				"Demasiados intentos. Intenta de nuevo en 30 segundos.",
			);
		}
	});

	test("a locked platform reads generic, with no mention of an incident", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: "PLATFORM_LOCKED", message: "Platform is locked down" },
			timestamp: new Date().toISOString(),
		});

		const result = await run(
			formRequest({ email: "ana@empresa.com", password: "x" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toBe(
				"El acceso está temporalmente suspendido. Inténtalo más tarde.",
			);
		}
	});

	// El mensaje técnico del servicio nunca viaja: podría traer detalles de
	// infraestructura.
	test("never returns the technical message", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
			timestamp: new Date().toISOString(),
		});

		const result = await run(
			formRequest({ email: "ana@empresa.com", password: "x" }),
			context,
		);

		expect(!result.success && result.error.message).not.toBe(
			"Invalid credentials",
		);
	});

	test("no cookie is set when the login fails", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: "INVALID_CREDENTIALS", message: "x" },
			timestamp: new Date().toISOString(),
		});

		const result = await run(
			formRequest({ email: "ana@empresa.com", password: "x" }),
			context,
		);

		expect(result).not.toBeInstanceOf(Response);
	});
});
