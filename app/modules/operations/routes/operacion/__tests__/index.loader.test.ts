import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const authPayloadOf = (role: string) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 1,
	email: "super@instituto.gob.mx",
	role,
	dependencyId: null,
	isTrainer: false,
	iat: 1_800_000_000,
});

const okList = (data: unknown[]) => ({
	success: true,
	data,
	pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
	timestamp: new Date().toISOString(),
});

const createHarness = (role = "SUPERADMIN", reply: unknown = okList([])) => {
	const calls = { emails: [] as unknown[], jobs: [] as unknown[] };
	const context = {
		authPayload: authPayloadOf(role),
		operationsService: {
			listFailedEmails: async (page: unknown) => {
				calls.emails.push(page);
				return reply;
			},
			listJobFailures: async (page: unknown) => {
				calls.jobs.push(page);
				return reply;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: new Request(`https://app.example.com/dashboard/operacion${query}`),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("operacion loader", () => {
	test("por defecto lee solo los correos fallidos", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result).toMatchObject({
			success: true,
			data: { tab: "emails", emails: [], jobs: [] },
		});
		expect(calls.emails).toEqual([{ page: 1, pageSize: 20 }]);
		expect(calls.jobs).toEqual([]);
	});

	test("la pestaña de trabajos lee solo los trabajos, con su página", async () => {
		const { context, calls } = createHarness();

		await run(context, "?tab=jobs&page=2&pageSize=50");

		expect(calls.jobs).toEqual([{ page: 2, pageSize: 50 }]);
		expect(calls.emails).toEqual([]);
	});

	test("un titular recibe 403 antes de leer nada", async () => {
		const { context, calls } = createHarness("DEPENDENCY_HEAD");

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls.emails).toEqual([]);
	});

	test("una pestaña desconocida responde 400 sin llamar al servicio", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "?tab=logs").catch((error) => error);

		expect(thrown.init.status).toBe(400);
		expect(calls.emails).toEqual([]);
	});

	test("un fallo del servicio se traduce con su status", async () => {
		const { context } = createHarness("SUPERADMIN", {
			success: false,
			error: { code: "UNEXPECTED_ERROR", message: "técnico" },
			timestamp: new Date().toISOString(),
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(500);
	});
});
