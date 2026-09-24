import { describe, expect, test } from "vitest";
import {
	authPayloadOf,
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const ISSUE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const createHarness = (
	reply: unknown = okReply({
		file: new Uint8Array([37, 80, 68, 70]),
		contentType: "application/pdf",
		fileName: "certificado-2026-0001.pdf",
	}),
) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload: authPayloadOf({ role: "USER" }),
		certificateService: {
			downloadMine: async (...args: unknown[]) => {
				calls.push(args);
				return reply;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query: string) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/mis-certificados/${ISSUE_ID}/descargar?${query}`,
		),
		context,
		params: { documentId: ISSUE_ID },
	} as unknown as LoaderArgs);

describe("descarga del certificado propio", () => {
	test("responde el archivo privado y sin caché", async () => {
		const { context, calls } = createHarness();

		const response = (await run(context, "formato=pdf")) as Response;

		expect(response.headers.get("Content-Disposition")).toBe(
			'attachment; filename="certificado-2026-0001.pdf"',
		);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(calls[0][1]).toMatchObject({ userId: 7 });
	});

	test("un diseño en la petición se ignora: solo viajan id y formato", async () => {
		const { context, calls } = createHarness();

		await run(
			context,
			`formato=png&design=${encodeURIComponent('{"subtitle":"Falso"}')}&userId=1`,
		);

		expect(calls[0][0]).toEqual({ documentId: ISSUE_ID, format: "png" });
	});

	test.each([
		[CERTIFICATE_ERROR_CODES.DOWNLOAD_DISABLED, 403],
		[CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND, 404],
	])("%s responde %i", async (code, status) => {
		const { context } = createHarness(failReply(code));

		const thrown = await run(context, "formato=pdf").catch((error) => error);

		expect(thrown.init.status).toBe(status);
	});
});
