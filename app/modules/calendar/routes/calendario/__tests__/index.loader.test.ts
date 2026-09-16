import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const authPayloadOf = (overrides: Record<string, unknown> = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 7,
	email: "elena.torres@universidad.mx",
	role: "USER",
	dependencyId: null,
	isTrainer: true,
	iat: 1_800_000_000,
	...overrides,
});

const createHarness = (
	reply: unknown = {
		success: true,
		data: { sessions: [] },
		timestamp: new Date().toISOString(),
	},
	authPayload: unknown = authPayloadOf(),
) => {
	const calls = { queries: [] as unknown[] };
	const context = {
		authPayload,
		calendarService: {
			listSessions: async (query: unknown) => {
				calls.queries.push(query);
				return reply;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/calendario${query}`,
		),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("calendario loader", () => {
	test("un capacitador externo entra: no hay guard de rol", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result.success).toBe(true);
		expect(calls.queries).toEqual([{ view: "month", staff: false }]);
	});

	test("lee mes, vista, filtros y el interruptor de personal", async () => {
		const { context, calls } = createHarness();

		await run(
			context,
			`?month=2026-11&view=list&modality=ONLINE&trainer=${DOCUMENT_ID}&staff=1`,
		);

		expect(calls.queries[0]).toEqual({
			month: "2026-11",
			view: "list",
			modality: "ONLINE",
			trainer: DOCUMENT_ID,
			staff: true,
		});
	});

	test("un filtro mal formado responde 400 sin llamar al servicio", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "?view=semana").catch((error) => error);

		expect(thrown.init.status).toBe(400);
		expect(calls.queries).toHaveLength(0);
	});

	test("el error del servicio se traduce con su status", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: "CALENDAR_INVALID_MONTH", message: "técnico" },
			timestamp: new Date().toISOString(),
		});

		const thrown = await run(context, "?month=2026-13").catch((error) => error);

		expect(thrown.init.status).toBe(400);
		expect(thrown.data.code).toBe("CALENDAR_INVALID_MONTH");
	});

	test("sin sesión redirige al inicio de sesión", async () => {
		const { context, calls } = createHarness(undefined, null);

		const thrown = await run(context).catch((error) => error);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
		expect(calls.queries).toHaveLength(0);
	});
});
