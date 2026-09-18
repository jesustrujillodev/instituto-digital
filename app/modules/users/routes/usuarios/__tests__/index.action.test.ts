import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	INTENT_FIELD,
	USER_INTENTS,
} from "../../../utils/parse-user-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const formRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request("https://app.example.com/usuarios", {
		method: "POST",
		body,
	});
};

const createHarness = (
	options: { role?: Role | null; failWith?: string } = {},
) => {
	const calls = {
		archive: [] as string[],
		unarchive: [] as string[],
		delete: [] as string[],
	};

	const respond = () =>
		options.failWith
			? {
					success: false as const,
					error: { code: options.failWith, message: "técnico" },
					timestamp: new Date().toISOString(),
				}
			: {
					success: true as const,
					data: null,
					timestamp: new Date().toISOString(),
				};

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: DOCUMENT_ID,
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "SUPERADMIN",
						iat: 1_800_000_000,
					},
		userService: {
			archive: async (id: string) => {
				calls.archive.push(id);
				return respond();
			},
			unarchive: async (id: string) => {
				calls.unarchive.push(id);
				return respond();
			},
			delete: async (id: string) => {
				calls.delete.push(id);
				return respond();
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("usuarios action — guard", () => {
	// El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	test("corta con 403 para un rol insuficiente antes de tocar el servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.archive,
				documentId: DOCUMENT_ID,
			}),
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.archive).toEqual([]);
	});
});

describe("usuarios action — intents", () => {
	test("archiva y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.archive,
				documentId: DOCUMENT_ID,
			}),
			context,
		);

		expect(result.success && result.message).toBe("Usuario archivado");
		expect(calls.archive).toEqual([DOCUMENT_ID]);
	});

	test("restaura y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.unarchive,
				documentId: DOCUMENT_ID,
			}),
			context,
		);

		expect(result.success && result.message).toBe("Usuario restaurado");
		expect(calls.unarchive).toEqual([DOCUMENT_ID]);
	});

	test("elimina permanentemente y lo anuncia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.delete,
				documentId: DOCUMENT_ID,
			}),
			context,
		);

		expect(result.success && result.message).toBe(
			"Usuario eliminado permanentemente",
		);
		expect(calls.delete).toEqual([DOCUMENT_ID]);
	});

	// Fail-closed en el switch: una intención que nadie declaró no ejecuta nada.
	test("una intención desconocida no ejecuta ninguna mutación", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ [INTENT_FIELD]: "borrar-todo", documentId: DOCUMENT_ID }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual({ archive: [], unarchive: [], delete: [] });
	});

	test("sin intent se comporta igual", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest({ documentId: DOCUMENT_ID }), context);

		expect(result.success).toBe(false);
		expect(calls.archive).toEqual([]);
	});
});

describe("usuarios action — validación de frontera", () => {
	// El id se valida ANTES del switch: un documentId malformado no llega al
	// servicio con ninguna intención.
	test("un documentId que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ [INTENT_FIELD]: USER_INTENTS.archive, documentId: "1" }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.archive).toEqual([]);
	});

	test("sin documentId tampoco llega", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ [INTENT_FIELD]: USER_INTENTS.delete }),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.delete).toEqual([]);
	});
});

describe("usuarios action — errores del servicio", () => {
	// El código NO se traduce y el mensaje SÍ: es lo que permite al cliente
	// distinguir el caso sin comparar strings de UI traducibles.
	test("localiza el fallo conservando el código estable", async () => {
		const { context } = createHarness({ failWith: "USER_NOT_ARCHIVED" });

		const result = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.delete,
				documentId: DOCUMENT_ID,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("USER_NOT_ARCHIVED");
			expect(result.error.message).toBe(
				"Archiva el usuario antes de eliminarlo permanentemente.",
			);
		}
	});

	test("un fallo desconocido no filtra su mensaje técnico", async () => {
		const { context } = createHarness({ failWith: "UNEXPECTED_ERROR" });

		const result = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.archive,
				documentId: DOCUMENT_ID,
			}),
			context,
		);

		expect(!result.success && result.error.message).toBe(
			"Ha ocurrido un error inesperado.",
		);
	});

	// Un action responde `{ success: false }` para que la pantalla siga en pie —
	// nunca corta con un status como haría un loader.
	test("un fallo no corta con status: la pantalla sigue en pie", async () => {
		const { context } = createHarness({ failWith: "USER_NOT_FOUND" });

		const result = await run(
			formRequest({
				[INTENT_FIELD]: USER_INTENTS.archive,
				documentId: DOCUMENT_ID,
			}),
			context,
		);

		expect(result).not.toBeInstanceOf(Response);
		expect(result.success).toBe(false);
	});
});

describe("usuarios action — fallo en cada intención", () => {
	// Las tres ramas comparten trato: el servicio devuelve el envelope con su
	// código estable y localizeError le pone la copia. No hay escalera de catch.
	const intents = [
		USER_INTENTS.archive,
		USER_INTENTS.unarchive,
		USER_INTENTS.delete,
	];

	for (const intent of intents) {
		test(`${intent} localiza el fallo del servicio`, async () => {
			const { context } = createHarness({ failWith: "USER_NOT_FOUND" });

			const result = await run(
				formRequest({ [INTENT_FIELD]: intent, documentId: DOCUMENT_ID }),
				context,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("USER_NOT_FOUND");
				expect(result.error.message).toBe("El usuario ya no existe.");
			}
		});
	}
});
