import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const ISSUE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const fileReply = okReply({
	file: new Uint8Array([37, 80, 68, 70]),
	contentType: "application/pdf",
	fileName: "certificado-2026-0001.pdf",
});

const createHarness = (options: ActorOptions & { reply?: unknown } = {}) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload: authPayloadOf(options),
		certificateService: {
			downloadIssue: async (...args: unknown[]) => {
				calls.push(args);
				return options.reply ?? fileReply;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query: string) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/certificados/${ISSUE_ID}/descargar?${query}`,
		),
		context,
		params: { documentId: ISSUE_ID },
	} as unknown as LoaderArgs);

describe("descarga del certificado", () => {
	test("responde el archivo como descarga privada", async () => {
		const { context } = createHarness();

		const response = (await run(context, "formato=pdf")) as Response;

		expect(response.headers.get("Content-Type")).toBe("application/pdf");
		expect(response.headers.get("Content-Disposition")).toBe(
			'attachment; filename="certificado-2026-0001.pdf"',
		);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([37, 80, 68, 70]),
		);
	});

	// La regla que no se negocia: el cliente no puede aportar el diseño.
	test("un diseño en la petición se ignora: el servicio recibe solo id y formato", async () => {
		const { context, calls } = createHarness();
		const forged = encodeURIComponent(
			JSON.stringify({
				subtitle: "Falsificado",
				recipientName: "Otra persona",
			}),
		);

		await run(context, `formato=png&design=${forged}&recipientName=Otra`);

		expect(calls[0][0]).toEqual({ documentId: ISSUE_ID, format: "png" });
	});

	test("un formato desconocido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "formato=svg").catch((error) => error);

		expect(thrown.init.status).toBe(400);
		expect(calls).toEqual([]);
	});

	test("quien no imparte recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(context, "formato=pdf").catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});

	test.each([
		[CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND, 404],
		[CERTIFICATE_ERROR_CODES.ISSUE_REVOKED, 409],
		[CERTIFICATE_ERROR_CODES.EXPORT_UNAVAILABLE, 503],
		[CERTIFICATE_ERROR_CODES.EXPORT_FAILED, 502],
	])("%s responde %i", async (code, status) => {
		const { context } = createHarness({ reply: failReply(code) });

		const thrown = await run(context, "formato=pdf").catch((error) => error);

		expect(thrown.init.status).toBe(status);
	});
});
