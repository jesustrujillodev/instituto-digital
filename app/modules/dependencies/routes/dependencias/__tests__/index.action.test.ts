import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	DEPENDENCY_INTENTS,
	INTENT_FIELD,
} from "../../../utils/parse-dependency-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const formRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request("https://app.example.com/dashboard/dependencias", {
		method: "POST",
		body,
	});
};

const createHarness = (
	options: { role?: Role | null; failWith?: string } = {},
) => {
	const calls = { archive: [] as string[], unarchive: [] as string[] };

	const respond = () =>
		options.failWith
			? {
					success: false as const,
					error: { code: options.failWith, message: "técnico" },
					timestamp: new Date().toISOString(),
				}
			: {
					success: true as const,
					data: { documentId: DOCUMENT_ID },
					timestamp: new Date().toISOString(),
				};

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "ana@instituto.gob.mx",
						role: options.role ?? "SUPERADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		dependencyService: {
			archive: async (documentId: string) => {
				calls.archive.push(documentId);
				return respond();
			},
			unarchive: async (documentId: string) => {
				calls.unarchive.push(documentId);
				return respond();
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("dependencias action — guard", () => {
	// Un loader protegido no protege las mutaciones de su propia ruta: el guard se
	// repite aquí a propósito.
	test("un titular recibe 403 antes de tocar el servicio", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		const thrown = await run(
			formRequest({
				documentId: DOCUMENT_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.archive,
			}),
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual({ archive: [], unarchive: [] });
	});

	test("sin sesión redirige a login", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(
			formRequest({ documentId: DOCUMENT_ID }),
			context,
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});
});

describe("dependencias action — intenciones", () => {
	test("archive desactiva y devuelve su copia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				documentId: DOCUMENT_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.archive,
			}),
			context,
		);

		expect(calls.archive).toEqual([DOCUMENT_ID]);
		expect(result.success && result.message).toBe("Dependencia desactivada");
	});

	test("unarchive restaura y devuelve su copia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				documentId: DOCUMENT_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.unarchive,
			}),
			context,
		);

		expect(calls.unarchive).toEqual([DOCUMENT_ID]);
		expect(result.success && result.message).toBe("Dependencia restaurada");
	});

	// Fail-closed: una intención que no se reconoce no se interpreta, se rechaza.
	test("una intención desconocida falla sin tocar nada", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ documentId: DOCUMENT_ID, [INTENT_FIELD]: "delete" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual({ archive: [], unarchive: [] });
	});

	test("sin intención falla igual", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest({ documentId: DOCUMENT_ID }), context);

		expect(result.success).toBe(false);
		expect(calls).toEqual({ archive: [], unarchive: [] });
	});
});

describe("dependencias action — validación de frontera", () => {
	test("un documentId que no es uuid falla antes del servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				documentId: "5",
				[INTENT_FIELD]: DEPENDENCY_INTENTS.archive,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.archive).toEqual([]);
	});
});

describe("dependencias action — fallos del servicio", () => {
	// Un action NUNCA corta con un status: devuelve el envelope para que la
	// pantalla siga en pie y pueda mostrar el error.
	test("devuelve el envelope con la copia, no un Response", async () => {
		const { context } = createHarness({ failWith: "DEPENDENCY_NOT_FOUND" });

		const result = await run(
			formRequest({
				documentId: DOCUMENT_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.archive,
			}),
			context,
		);

		expect(result).not.toBeInstanceOf(Response);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toBe("La dependencia ya no existe.");
		}
	});

	test("no filtra el mensaje técnico de un fallo desconocido", async () => {
		const { context } = createHarness({ failWith: "UNEXPECTED_ERROR" });

		const result = await run(
			formRequest({
				documentId: DOCUMENT_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.unarchive,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.message).not.toBe("técnico");
	});
});
