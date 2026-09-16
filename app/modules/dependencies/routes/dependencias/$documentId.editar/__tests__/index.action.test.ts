import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	DEPENDENCY_INTENTS,
	INTENT_FIELD,
} from "../../../../utils/parse-dependency-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";

const formRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request(
		`https://app.example.com/dashboard/dependencias/${DOCUMENT_ID}/editar`,
		{ method: "POST", body },
	);
};

const okOf = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

const failOf = (code: string) => ({
	success: false as const,
	error: { code, message: "técnico" },
	timestamp: new Date().toISOString(),
});

const createHarness = (
	options: {
		role?: Role | null;
		updateFails?: string;
		assignFails?: string;
	} = {},
) => {
	const calls = {
		update: [] as unknown[],
		assignHead: [] as unknown[],
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
			update: async (documentId: string, dto: unknown) => {
				calls.update.push({ documentId, dto });
				return options.updateFails
					? failOf(options.updateFails)
					: okOf({ documentId });
			},
			assignHead: async (documentId: string, userDocumentId: string) => {
				calls.assignHead.push({ documentId, userDocumentId });
				return options.assignFails
					? failOf(options.assignFails)
					: okOf({ documentId });
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	request: Request,
	context: ActionArgs["context"],
	documentId = DOCUMENT_ID,
) =>
	action({
		request,
		context,
		params: { documentId },
	} as unknown as ActionArgs);

describe("editar dependencia action — guard", () => {
	test("un titular recibe 403 sin tocar nada", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		const thrown = await run(
			formRequest({ name: "Obras", [INTENT_FIELD]: DEPENDENCY_INTENTS.update }),
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual({ update: [], assignHead: [] });
	});
});

describe("editar dependencia action — guardar", () => {
	test("actualiza y devuelve su copia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				acronym: "SOP",
				[INTENT_FIELD]: DEPENDENCY_INTENTS.update,
			}),
			context,
		);

		expect(result.success && result.message).toBe("Dependencia actualizada");
		expect(calls.update).toEqual([
			{ documentId: DOCUMENT_ID, dto: { acronym: "SOP" } },
		]);
	});

	// El recurso que se edita lo fija la URL, y la regla descarta lo que no
	// declara: un formulario manipulado no puede colar un documentId ajeno ni
	// campos que el dominio no admite.
	test("ignora un documentId enviado en el formulario", async () => {
		const { context, calls } = createHarness();

		await run(
			formRequest({
				documentId: "99999999-9999-4999-8999-999999999999",
				acronym: "SOP",
				[INTENT_FIELD]: DEPENDENCY_INTENTS.update,
			}),
			context,
		);

		expect(calls.update).toEqual([
			{ documentId: DOCUMENT_ID, dto: { acronym: "SOP" } },
		]);
	});

	test("un nombre inválido falla sin llegar al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ name: "OP", [INTENT_FIELD]: DEPENDENCY_INTENTS.update }),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.update).toEqual([]);
	});

	test("un documentId de URL que no es uuid falla antes del servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				acronym: "SOP",
				[INTENT_FIELD]: DEPENDENCY_INTENTS.update,
			}),
			context,
			"5",
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.update).toEqual([]);
	});
});

describe("editar dependencia action — designar titular", () => {
	// Es un relevo, no un campo del formulario: va por su propia intención para
	// que guardar unas siglas no arrastre el cambio de rol de dos cuentas.
	test("designa al candidato y avisa de las sesiones cerradas", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({
				userDocumentId: CANDIDATE_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.assignHead,
			}),
			context,
		);

		expect(calls.assignHead).toEqual([
			{ documentId: DOCUMENT_ID, userDocumentId: CANDIDATE_ID },
		]);
		expect(result.success && result.message).toContain("Titular designado");
		expect(calls.update).toEqual([]);
	});

	test("sin candidato falla en la validación", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ [INTENT_FIELD]: DEPENDENCY_INTENTS.assignHead }),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.assignHead).toEqual([]);
	});

	// Criterio de aceptación 7 del PRD: la copia es propia, no la del nombre
	// duplicado. Es lo que la traducción por meta.target hace posible.
	test("ya tiene titular responde con su copia propia", async () => {
		const { context } = createHarness({
			assignFails: "DEPENDENCY_ALREADY_HAS_HEAD",
		});

		const result = await run(
			formRequest({
				userDocumentId: CANDIDATE_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.assignHead,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toContain("ya tiene titular");
			expect(result.error.message).not.toContain("nombre");
		}
	});

	test("un candidato de otra dependencia responde con su motivo", async () => {
		const { context } = createHarness({
			assignFails: "HEAD_MUST_BELONG_TO_DEPENDENCY",
		});

		const result = await run(
			formRequest({
				userDocumentId: CANDIDATE_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.assignHead,
			}),
			context,
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toContain("pertenecer");
		}
	});

	// Un action nunca corta con un status: la pantalla sigue en pie y el diálogo
	// muestra el error junto a la acción que lo produjo.
	test("un fallo nunca es un Response", async () => {
		const { context } = createHarness({ assignFails: "DEPENDENCY_INACTIVE" });

		const result = await run(
			formRequest({
				userDocumentId: CANDIDATE_ID,
				[INTENT_FIELD]: DEPENDENCY_INTENTS.assignHead,
			}),
			context,
		);

		expect(result).not.toBeInstanceOf(Response);
		expect(result.success).toBe(false);
	});
});
