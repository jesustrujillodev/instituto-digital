import { describe, expect, test } from "vitest";
import { CHECK_IN_ERROR_CODES } from "../../../../domain/check-in.errors";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 7,
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const createHarness = (
	options: { anonymous?: boolean; allowed?: boolean } = {},
) => {
	const calls = { previews: 0 };

	const context = {
		authPayload: options.anonymous ? null : authPayload,
		rateLimiter: {
			consume: () => ({
				allowed: options.allowed ?? true,
				retryAfterMs: options.allowed === false ? 30_000 : 0,
			}),
		},
		checkInService: {
			preview: async () => {
				calls.previews += 1;
				return okReply({ canRegister: true });
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], token = TOKEN) =>
	loader({
		request: new Request(`https://app.example.com/asistencia/${token}`),
		context,
		params: { token },
	} as unknown as LoaderArgs);

/** El redirect se lanza como `Response`; `toRouteError`, como `data()`. */
const caught = async (fn: () => Promise<unknown>): Promise<unknown> => {
	try {
		await fn();
	} catch (thrown) {
		return thrown;
	}
	throw new Error("no lanzó");
};

const statusOf = (thrown: unknown): number | undefined =>
	thrown instanceof Response
		? thrown.status
		: (thrown as { init?: { status?: number } }).init?.status;

describe("escaneo loader", () => {
	test("con sesión devuelve el preview sin escribir", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result.success).toBe(true);
		expect(calls.previews).toBe(1);
	});

	test("sin sesión manda al login conservando el token", async () => {
		const { context, calls } = createHarness({ anonymous: true });

		const response = (await caught(() => run(context))) as Response;

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			`/iniciar-sesion?redirectTo=${encodeURIComponent(`/asistencia/${TOKEN}`)}`,
		);
		expect(calls.previews).toBe(0);
	});

	test("un token mal formado no llega al servicio ni al redirect", async () => {
		const { context, calls } = createHarness({ anonymous: true });

		expect(statusOf(await caught(() => run(context, "no-es-un-token")))).toBe(
			404,
		);
		expect(calls.previews).toBe(0);
	});

	test("el rate limit corta antes de mirar el token", async () => {
		const { context, calls } = createHarness({ allowed: false });

		expect(statusOf(await caught(() => run(context)))).toBe(429);
		expect(calls.previews).toBe(0);
	});

	test("un rechazo del servicio viaja con su código estable", async () => {
		const context = {
			authPayload,
			rateLimiter: { consume: () => ({ allowed: true, retryAfterMs: 0 }) },
			checkInService: {
				preview: async () => ({
					success: false,
					error: { code: CHECK_IN_ERROR_CODES.NOT_ENROLLED, message: "" },
					timestamp: new Date().toISOString(),
				}),
			},
		} as unknown as LoaderArgs["context"];

		expect(statusOf(await caught(() => run(context)))).toBe(403);
	});
});
