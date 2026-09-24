import { describe, expect, test } from "vitest";
import {
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { createMemoryRateLimiter } from "@/shared/rate-limit/rate-limiter.memory";
import { CERTIFICATE_VERIFY_RATE_LIMIT } from "../../../../domain/certificate.config";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import { headers } from "../index";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const ISSUE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const valid = {
	status: "valid",
	folio: "2026-0042",
	recipientName: "Ana Ruiz",
	courseTitle: "Seguridad en obra",
	dependencyName: "Secretaría de Obras Públicas",
	hours: "20 horas",
	issuedOn: "10 de marzo de 2026",
};

// Sin `authPayload`: la ruta es pública y no lo lee.
const createHarness = (reply: unknown = okReply(valid)) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload: null,
		rateLimiter: createMemoryRateLimiter(),
		certificateService: {
			verify: async (...args: unknown[]) => {
				calls.push(args);
				return reply;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (
	context: LoaderArgs["context"],
	documentId = ISSUE_ID,
	ip = "203.0.113.7",
) =>
	loader({
		request: new Request(`https://app.example.com/verificar/${documentId}`, {
			headers: { "X-Forwarded-For": ip },
		}),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("verificación pública", () => {
	test("responde sin sesión con lo impreso", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result).toMatchObject({ success: true, data: valid });
		expect(calls[0]).toEqual([ISSUE_ID]);
	});

	// Probado sobre la forma: ni correo ni identificadores internos.
	test("la respuesta no trae correo ni ids", async () => {
		const { context } = createHarness();

		const body = JSON.stringify(await run(context));

		expect(body).not.toMatch(/@|"id"|userId|courseId|documentId/);
	});

	test("un revocado se distingue de uno inexistente", async () => {
		const revoked = createHarness(
			okReply({ status: "revoked", folio: "2026-0042" }),
		);
		const missing = createHarness(
			failReply(CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND),
		);

		expect(await run(revoked.context)).toMatchObject({
			data: { status: "revoked" },
		});
		const thrown = await run(missing.context).catch((error) => error);
		expect(thrown.init.status).toBe(404);
	});

	test("un código malformado responde 404 sin llegar al servicio", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "2026-0001").catch((error) => error);

		expect(thrown.init.status).toBe(404);
		expect(calls).toEqual([]);
	});

	test("pasado el límite por IP responde 429 sin llegar al servicio", async () => {
		const { context, calls } = createHarness();

		for (let i = 0; i < CERTIFICATE_VERIFY_RATE_LIMIT.limit; i++) {
			await run(context);
		}
		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(429);
		expect(thrown.data.code).toBe(CERTIFICATE_ERROR_CODES.VERIFY_RATE_LIMITED);
		expect(calls).toHaveLength(CERTIFICATE_VERIFY_RATE_LIMIT.limit);
	});

	test("el límite es por IP: otra dirección sigue consultando", async () => {
		const { context } = createHarness();

		for (let i = 0; i <= CERTIFICATE_VERIFY_RATE_LIMIT.limit; i++) {
			await run(context).catch(() => undefined);
		}

		expect(await run(context, ISSUE_ID, "198.51.100.9")).toMatchObject({
			success: true,
		});
	});

	test("la página no se indexa ni se guarda en cachés compartidas", () => {
		expect(headers()).toEqual({
			"X-Robots-Tag": "noindex, nofollow",
			"Cache-Control": "private, no-store",
		});
	});
});
