import { describe, expect, test } from "vitest";
import type { SpreadsheetSheet } from "@/shared/spreadsheet/spreadsheet.port";
import {
	type ActorOptions,
	authPayloadOf,
	failReply,
	getRequest,
	okReply,
} from "../../__tests__/route-harness";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const FILE = new Uint8Array([80, 75, 3, 4]);

const createHarness = (options: ActorOptions & { listFails?: string } = {}) => {
	const calls = { sheets: [] as (readonly SpreadsheetSheet[])[] };
	const context = {
		authPayload: authPayloadOf(options),
		clock: { now: () => new Date("2026-09-19T18:00:00.000Z") },
		enrollmentService: {
			listMine: async () =>
				options.listFails
					? failReply(options.listFails)
					: okReply({
							invitations: [],
							upcoming: [{ course: { title: "Próximo", sessions: [] } }],
							inProgress: [],
							finished: [{ course: { title: "Ética pública", sessions: [] } }],
						}),
		},
		spreadsheetWriter: {
			toXlsx: async (sheets: readonly SpreadsheetSheet[]) => {
				calls.sheets.push(sheets);
				return FILE;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"]) =>
	loader({
		request: getRequest("/dashboard/mis-cursos/finalizados.xlsx"),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("mis-cursos/finalizados.xlsx loader", () => {
	test("descarga solo los cursos finalizados como adjunto", async () => {
		const { context, calls } = createHarness();

		const response = await run(context);

		expect(calls.sheets[0][0].rows.map((row) => row[0])).toEqual([
			"Ética pública",
		]);
		expect(response.headers.get("Content-Type")).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		expect(response.headers.get("Content-Disposition")).toBe(
			'attachment; filename="mis-cursos-finalizados-2026-09-19.xlsx"',
		);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(FILE);
	});

	test("un fallo del servicio responde con el status de su código", async () => {
		const { context, calls } = createHarness({
			listFails: "UNEXPECTED_ERROR",
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(500);
		expect(calls.sheets).toHaveLength(0);
	});

	test("un capacitador externo recibe 403", async () => {
		const { context, calls } = createHarness({
			dependencyId: null,
			isTrainer: true,
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls.sheets).toHaveLength(0);
	});
});
