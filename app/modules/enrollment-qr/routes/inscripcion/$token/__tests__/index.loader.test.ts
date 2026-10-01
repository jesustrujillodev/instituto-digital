import { describe, expect, test } from "vitest";
import { ENROLLMENT_QR_ERROR_CODES } from "../../../../domain/enrollment-qr.errors";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const COURSE_DOC = "11111111-1111-4111-8111-111111111111";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 7,
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const createHarness = (
	options: { anonymous?: boolean; allowed?: boolean; failsWith?: string } = {},
) => {
	const calls = { resolves: 0 };

	const context = {
		authPayload: options.anonymous ? null : authPayload,
		rateLimiter: {
			consume: () => ({
				allowed: options.allowed ?? true,
				retryAfterMs: options.allowed === false ? 30_000 : 0,
			}),
		},
		enrollmentQrService: {
			resolve: async () => {
				calls.resolves += 1;
				return options.failsWith
					? {
							success: false,
							error: { code: options.failsWith, message: "" },
							timestamp: new Date().toISOString(),
						}
					: {
							success: true,
							data: { courseDocumentId: COURSE_DOC },
							timestamp: new Date().toISOString(),
						};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], token = TOKEN) =>
	loader({
		request: new Request(`https://app.example.com/inscripcion/${token}`),
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

describe("escaneo de inscripción loader", () => {
	test("con sesión lleva a la ficha del catálogo sin inscribir", async () => {
		const { context, calls } = createHarness();

		const response = (await caught(() => run(context))) as Response;

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			`/dashboard/catalogo-de-capacitaciones/${COURSE_DOC}`,
		);
		expect(calls.resolves).toBe(1);
	});

	test("sin sesión manda al login conservando el token", async () => {
		const { context, calls } = createHarness({ anonymous: true });

		const response = (await caught(() => run(context))) as Response;

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			`/iniciar-sesion?redirectTo=${encodeURIComponent(`/inscripcion/${TOKEN}`)}`,
		);
		expect(calls.resolves).toBe(0);
	});

	test("un token mal formado no llega al servicio ni al redirect", async () => {
		const { context, calls } = createHarness({ anonymous: true });

		expect(statusOf(await caught(() => run(context, "no-es-un-token")))).toBe(
			404,
		);
		expect(calls.resolves).toBe(0);
	});

	test("el rate limit corta antes de mirar el token", async () => {
		const { context, calls } = createHarness({ allowed: false });

		expect(statusOf(await caught(() => run(context)))).toBe(429);
		expect(calls.resolves).toBe(0);
	});

	test.each([
		[ENROLLMENT_QR_ERROR_CODES.INVALID_TOKEN, 404],
		[ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE, 409],
		[ENROLLMENT_QR_ERROR_CODES.NOT_IN_AUDIENCE, 403],
	])("un rechazo %s corta con %i", async (code, status) => {
		const { context } = createHarness({ failsWith: code });

		expect(statusOf(await caught(() => run(context)))).toBe(status);
	});
});
