import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const createHarness = (options: ActorOptions = {}) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload: authPayloadOf(options),
		certificateService: {
			downloadSample: async (...args: unknown[]) => {
				calls.push(args);
				return okReply({
					file: new Uint8Array([1]),
					contentType: "image/png",
					fileName: "certificado-2026-0001.png",
				});
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query: string) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${COURSE_ID}/certificado/muestra?${query}`,
		),
		context,
		params: { documentId: COURSE_ID },
	} as unknown as LoaderArgs);

describe("muestra del certificado", () => {
	test("pide la versión guardada, nunca un diseño de la petición", async () => {
		const { context, calls } = createHarness();

		const response = (await run(
			context,
			"version=draft&formato=png&payload=%7B%7D",
		)) as Response;

		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(calls[0][0]).toEqual({
			documentId: COURSE_ID,
			version: "draft",
			format: "png",
		});
	});

	test("una versión desconocida no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "version=otra&formato=pdf").catch(
			(error) => error,
		);

		expect(thrown.init.status).toBe(400);
		expect(calls).toEqual([]);
	});

	test("un participante recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(context, "version=draft&formato=pdf").catch(
			(error) => error,
		);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});
});
