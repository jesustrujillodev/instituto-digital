import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	GROUP_INTENTS,
	INTENT_FIELD,
} from "../../../../utils/parse-group-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = {
		added: [] as unknown[],
		removed: [] as unknown[],
		updated: [] as unknown[],
	};

	const reply = () =>
		options.failsWith
			? {
					success: false as const,
					error: { code: options.failsWith, message: "técnico" },
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
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "titular@instituto.gob.mx",
						role: options.role ?? "DEPENDENCY_HEAD",
						dependencyId: 3,
						isTrainer: false,
						iat: 1_800_000_000,
					},
		groupService: {
			addMembers: async (documentId: string, ids: unknown) => {
				calls.added.push({ documentId, ids });
				return reply();
			},
			removeMember: async (documentId: string, userDocumentId: string) => {
				calls.removed.push({ documentId, userDocumentId });
				return reply();
			},
			update: async (documentId: string, dto: unknown) => {
				calls.updated.push({ documentId, dto });
				return reply();
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	entries: Array<[string, string]>,
	context: ActionArgs["context"],
	documentId = GROUP_ID,
) => {
	const body = new FormData();
	for (const [key, value] of entries) body.append(key, value);

	return action({
		request: new Request(
			`https://app.example.com/dashboard/grupos/${documentId}/editar`,
			{ method: "POST", body },
		),
		context,
		params: { documentId },
	} as unknown as ActionArgs);
};

describe("editar grupo — guard", () => {
	test("un participante recibe 403 sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run([["name", "Otro"]], context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.updated).toEqual([]);
	});
});

describe("editar grupo — miembros", () => {
	// El lote entero llega al servicio: quedarse con el último identificador
	// dejaría el grupo con un solo miembro sin avisar.
	test("el alta manda TODOS los identificadores del envío", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			[
				["userDocumentIds", MEMBER_A],
				["userDocumentIds", MEMBER_B],
				[INTENT_FIELD, GROUP_INTENTS.addMembers],
			],
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.added).toEqual([
			{ documentId: GROUP_ID, ids: [MEMBER_A, MEMBER_B] },
		]);
	});

	test("un alta sin nadie seleccionado no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			[[INTENT_FIELD, GROUP_INTENTS.addMembers]],
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.added).toEqual([]);
	});

	test("la baja es puntual y por identificador público", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			[
				["userDocumentId", MEMBER_A],
				[INTENT_FIELD, GROUP_INTENTS.removeMember],
			],
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.removed).toEqual([
			{ documentId: GROUP_ID, userDocumentId: MEMBER_A },
		]);
	});

	test("una cuenta fuera de la dependencia del grupo vuelve con su copia", async () => {
		const { context } = createHarness({
			failsWith: "MEMBER_OUT_OF_DEPENDENCY",
		});

		const result = await run(
			[
				["userDocumentIds", MEMBER_A],
				[INTENT_FIELD, GROUP_INTENTS.addMembers],
			],
			context,
		);

		expect(!result.success && result.error.message).toBe(
			"Solo puedes agregar personal interno y activo de la dependencia del grupo.",
		);
	});
});

describe("editar grupo — datos", () => {
	test("sin intención declarada se guardan los campos del formulario", async () => {
		const { context, calls } = createHarness();

		const result = await run([["name", "Mandos superiores"]], context);

		expect(result.success).toBe(true);
		expect(calls.updated).toEqual([
			{ documentId: GROUP_ID, dto: { name: "Mandos superiores" } },
		]);
	});

	test("un documentId que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			[["name", "Mandos superiores"]],
			context,
			"no-es-uuid",
		);

		expect(result.success).toBe(false);
		expect(calls.updated).toEqual([]);
	});

	test("el nombre duplicado vuelve marcando su campo", async () => {
		const { context } = createHarness({ failsWith: "DUPLICATE_GROUP_NAME" });

		const result = await run([["name", "Mandos medios"]], context);

		expect(!result.success && result.error.fieldErrors).toEqual({
			name: "Ya existe un grupo con ese nombre",
		});
	});
});
