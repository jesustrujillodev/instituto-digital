import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import {
	GROUP_INTENTS,
	INTENT_FIELD,
} from "../../../utils/parse-group-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = { archived: [] as string[], unarchived: [] as string[] };

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
			archive: async (documentId: string) => {
				calls.archived.push(documentId);
				return reply();
			},
			unarchive: async (documentId: string) => {
				calls.unarchived.push(documentId);
				return reply();
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	fields: Record<string, string>,
	context: ActionArgs["context"],
) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	return action({
		request: new Request("https://app.example.com/dashboard/grupos", {
			method: "POST",
			body,
		}),
		context,
	} as ActionArgs);
};

describe("grupos action — guard", () => {
	test("un participante recibe 403 sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			{ documentId: GROUP_ID, [INTENT_FIELD]: GROUP_INTENTS.archive },
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.archived).toEqual([]);
	});
});

describe("grupos action — intenciones", () => {
	test("archiva y restaura por el documentId", async () => {
		const { context, calls } = createHarness();

		await run(
			{ documentId: GROUP_ID, [INTENT_FIELD]: GROUP_INTENTS.archive },
			context,
		);
		await run(
			{ documentId: GROUP_ID, [INTENT_FIELD]: GROUP_INTENTS.unarchive },
			context,
		);

		expect(calls.archived).toEqual([GROUP_ID]);
		expect(calls.unarchived).toEqual([GROUP_ID]);
	});

	test("una intención desconocida se rechaza como validación", async () => {
		const { context } = createHarness();

		const result = await run(
			{ documentId: GROUP_ID, [INTENT_FIELD]: "borrar-todo" },
			context,
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
	});

	// El superadministrador entra a la pantalla pero su alcance no escribe: el
	// corte lo da el servicio, y el action devuelve su copia.
	test("un alcance que no administra vuelve con su copia, no con un 403", async () => {
		const { context } = createHarness({ failsWith: "GROUP_FORBIDDEN_SCOPE" });

		const result = await run(
			{ documentId: GROUP_ID, [INTENT_FIELD]: GROUP_INTENTS.archive },
			context,
		);

		expect(!result.success && result.error.message).toBe(
			"Los grupos los administra la dependencia a la que pertenecen.",
		);
	});
});
