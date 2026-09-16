import { describe, expect, test } from "vitest";
import { serializeAuthCookies } from "@/core/cookies.server";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	INTENT_FIELD,
	SESSION_INTENTS,
} from "../../../utils/session-monitor-form";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";

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

const formRequest = async (
	fields: Record<string, string>,
	refreshToken: string | null = null,
) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	const headers: Record<string, string> = {};
	if (refreshToken !== null) {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken,
		});
		headers.Cookie = cookies.map((c) => c.split(";")[0]).join("; ");
	}

	return new Request("https://app.example.com/sesiones", {
		method: "POST",
		body,
		headers,
	});
};

const createHarness = (
	options: {
		role?: Role | null;
		failWith?: string;
		revokedCount?: number;
		purgedSessions?: number;
	} = {},
) => {
	const calls = {
		revoke: [] as string[],
		revokeAllForUser: [] as number[],
		revokeAllExceptCurrent: [] as string[],
		cleanupExpired: 0,
		lockdown: [] as unknown[],
		lift: 0,
	};

	const maybeFail = <T>(data: T) =>
		options.failWith ? failOf(options.failWith) : okOf(data);

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "ADMIN",
						iat: 1_800_000_000,
					},
		sessionMonitorService: {
			revoke: async (id: string) => {
				calls.revoke.push(id);
				return maybeFail(null);
			},
			revokeAllForUser: async (userId: number) => {
				calls.revokeAllForUser.push(userId);
				return maybeFail(null);
			},
			revokeAllExceptCurrent: async (token: string) => {
				calls.revokeAllExceptCurrent.push(token);
				return maybeFail({ revokedCount: options.revokedCount ?? 3 });
			},
			cleanupExpired: async () => {
				calls.cleanupExpired += 1;
				return maybeFail({ revokedCount: options.revokedCount ?? 12 });
			},
		},
		securityStateService: {
			lockdown: async (dto: unknown, userId: number) => {
				calls.lockdown.push({ dto, userId });
				return maybeFail({ purgedSessions: options.purgedSessions ?? 5 });
			},
			lift: async () => {
				calls.lift += 1;
				return maybeFail(null);
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("sesiones action — guard", () => {
	// El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	test("cuts with a 403 for a non-admin before touching any service", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.revokeAll,
			}),
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.revokeAllExceptCurrent).toEqual([]);
	});
});

describe("sesiones action — revokeSession", () => {
	test("revokes the session and announces it", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.revokeSession,
				sessionId: SESSION_ID,
			}),
			context,
		);

		expect(result.success).toBe(true);
		if (result.success) expect(result.message).toBe("Sesión revocada");
		expect(calls.revoke).toEqual([SESSION_ID]);
	});

	// La validación de frontera corta antes del servicio: un id que no es uuid no
	// llega al repositorio.
	test("an id that is not a uuid never reaches the service", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.revokeSession,
				sessionId: "no-es-uuid",
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.revoke).toEqual([]);
	});

	// Revocar algo que ya desapareció debe decirlo, no fingir éxito.
	test("localises a missing session keeping its stable code", async () => {
		const { context } = createHarness({ failWith: "SESSION_NOT_FOUND" });

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.revokeSession,
				sessionId: SESSION_ID,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("SESSION_NOT_FOUND");
			expect(result.error.message).toBe(
				"La sesión ya no existe o ya fue cerrada.",
			);
		}
	});
});

describe("sesiones action — revokeUser", () => {
	test("converts the form text into the numeric id the rule demands", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.revokeUser,
				userId: "7",
			}),
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.revokeAllForUser).toEqual([7]);
	});

	test("rejects a non-numeric id without calling the service", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.revokeUser,
				userId: "abc",
			}),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.revokeAllForUser).toEqual([]);
	});
});

describe("sesiones action — revokeAll", () => {
	// Se pasa el token CRUDO: hashearlo y resolver la sesión es del servicio, el
	// adaptador no manipula secretos (mismo trato que en /cerrar-sesion).
	test("hands the raw refresh token to the service", async () => {
		const { context, calls } = createHarness();

		await run(
			await formRequest(
				{ [INTENT_FIELD]: SESSION_INTENTS.revokeAll },
				"token-crudo",
			),
			context,
		);

		expect(calls.revokeAllExceptCurrent).toEqual(["token-crudo"]);
	});

	// Sin cookie NO se corta en el adaptador: el servicio ya trata "no resuelve a
	// una sesión" como INVALID_SESSION, y ese es el único sitio que decide que la
	// operación no puede correr sin una sesión que preservar.
	test("delegates the no-cookie case to the service instead of cutting", async () => {
		const { context, calls } = createHarness();

		await run(
			await formRequest({ [INTENT_FIELD]: SESSION_INTENTS.revokeAll }),
			context,
		);

		expect(calls.revokeAllExceptCurrent).toEqual([""]);
	});

	test("announces the count and that the caller's own session survived", async () => {
		const { context } = createHarness({ revokedCount: 3 });

		const result = await run(
			await formRequest({ [INTENT_FIELD]: SESSION_INTENTS.revokeAll }, "t"),
			context,
		);

		expect(result.success && result.message).toBe(
			"Se revocaron 3 sesiones. La tuya sigue activa.",
		);
	});

	// El conteo se le enseña a una persona: "1 sesiones" delata la plantilla.
	test("uses the singular for a single session", async () => {
		const { context } = createHarness({ revokedCount: 1 });

		const result = await run(
			await formRequest({ [INTENT_FIELD]: SESSION_INTENTS.revokeAll }, "t"),
			context,
		);

		expect(result.success && result.message).toBe(
			"Se revocaron 1 sesión. La tuya sigue activa.",
		);
	});
});

describe("sesiones action — cleanupExpired", () => {
	test("reports how many expired sessions were removed", async () => {
		const { context, calls } = createHarness({ revokedCount: 12 });

		const result = await run(
			await formRequest({ [INTENT_FIELD]: SESSION_INTENTS.cleanupExpired }),
			context,
		);

		expect(calls.cleanupExpired).toBe(1);
		expect(result.success && result.message).toBe(
			"Se eliminaron 12 sesiones expiradas",
		);
	});
});

describe("sesiones action — lockdown", () => {
	test("passes the dto and the acting admin id", async () => {
		const { context, calls } = createHarness({ purgedSessions: 5 });

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.lockdown,
				scope: "all",
				confirmation: "CERRAR",
				reason: "incidente",
			}),
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.lockdown).toEqual([
			{
				dto: { scope: "all", confirmation: "CERRAR", reason: "incidente" },
				userId: 7,
			},
		]);
	});

	// Confirmación reforzada: sin la palabra exacta no se ejecuta la acción más
	// destructiva del sistema.
	test("does not run without the exact confirmation word", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.lockdown,
				scope: "all",
				confirmation: "cerrar",
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.lockdown).toEqual([]);
	});

	test("rejects an unknown scope", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.lockdown,
				scope: "except-user",
				confirmation: "CERRAR",
			}),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.lockdown).toEqual([]);
	});

	test("announces how many sessions the lockdown purged", async () => {
		const { context } = createHarness({ purgedSessions: 1 });

		const result = await run(
			await formRequest({
				[INTENT_FIELD]: SESSION_INTENTS.lockdown,
				scope: "all",
				confirmation: "CERRAR",
			}),
			context,
		);

		expect(result.success && result.message).toBe(
			"Lockdown activado. 1 sesión purgadas.",
		);
	});
});

describe("sesiones action — lift", () => {
	test("lifts the lockdown", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({ [INTENT_FIELD]: SESSION_INTENTS.lift }),
			context,
		);

		expect(calls.lift).toBe(1);
		expect(result.success && result.message).toBe("Lockdown levantado");
	});
});

describe("sesiones action — unknown intent", () => {
	// Fail-closed en el switch: una intención que nadie declaró no ejecuta nada.
	test("an unrecognised intent runs nothing and fails validation", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			await formRequest({ [INTENT_FIELD]: "borrar-todo" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toMatchObject({
			revoke: [],
			revokeAllForUser: [],
			revokeAllExceptCurrent: [],
			cleanupExpired: 0,
			lift: 0,
		});
	});

	test("a missing intent behaves the same", async () => {
		const { context } = createHarness();

		const result = await run(await formRequest({}), context);

		expect(result.success).toBe(false);
	});
});

describe("sesiones action — fallos del servicio en cada intención", () => {
	// Todas las ramas comparten el mismo trato: el servicio ya devolvió el
	// envelope con su código estable, y localizeError le pone la copia. No hay
	// escalera de catch por intención.
	const cases: { name: string; fields: Record<string, string> }[] = [
		{
			name: "revokeUser",
			fields: { [INTENT_FIELD]: SESSION_INTENTS.revokeUser, userId: "7" },
		},
		{
			name: "revokeAll",
			fields: { [INTENT_FIELD]: SESSION_INTENTS.revokeAll },
		},
		{
			name: "cleanupExpired",
			fields: { [INTENT_FIELD]: SESSION_INTENTS.cleanupExpired },
		},
		{
			name: "lockdown",
			fields: {
				[INTENT_FIELD]: SESSION_INTENTS.lockdown,
				scope: "all",
				confirmation: "CERRAR",
			},
		},
		{ name: "lift", fields: { [INTENT_FIELD]: SESSION_INTENTS.lift } },
	];

	for (const { name, fields } of cases) {
		test(`${name} localises the failure keeping its stable code`, async () => {
			const { context } = createHarness({ failWith: "PLATFORM_LOCKED" });

			const result = await run(await formRequest(fields, "t"), context);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("PLATFORM_LOCKED");
				expect(result.error.message).toContain("lockdown");
				expect(result.error.message).not.toBe("técnico");
			}
		});
	}
});
