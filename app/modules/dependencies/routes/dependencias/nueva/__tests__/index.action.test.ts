import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const formRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request("https://app.example.com/dashboard/dependencias/nueva", {
		method: "POST",
		body,
	});
};

const createHarness = (
	options: { role?: Role | null; failWith?: string } = {},
) => {
	const calls = { created: [] as unknown[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@instituto.gob.mx",
						role: options.role ?? "SUPERADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		dependencyService: {
			create: async (dto: unknown) => {
				calls.created.push(dto);
				return options.failWith
					? {
							success: false as const,
							error: { code: options.failWith, message: "técnico" },
							timestamp: new Date().toISOString(),
						}
					: {
							success: true as const,
							data: { documentId: "11111111-1111-4111-8111-111111111111" },
							timestamp: new Date().toISOString(),
						};
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("nueva dependencia action", () => {
	test("crea y devuelve su copia", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest({ name: "Obras Públicas", acronym: "SOP" }),
			context,
		);

		expect(calls.created).toEqual([{ name: "Obras Públicas", acronym: "SOP" }]);
		expect(result.success && result.message).toBe("Dependencia creada");
	});

	// El trim vive en la regla y corre en cliente y servidor: lo que llega al
	// servicio ya está normalizado, no se guarda " Obras ".
	test("recorta el nombre antes de crear", async () => {
		const { context, calls } = createHarness();

		await run(formRequest({ name: "  Obras Públicas  " }), context);

		expect(calls.created).toEqual([{ name: "Obras Públicas" }]);
	});

	// "" es la ausencia de un campo opcional, no un valor: sin descartarlo se
	// guardarían siglas vacías en vez de ninguna.
	test("unas siglas vacías no llegan como cadena vacía", async () => {
		const { context, calls } = createHarness();

		await run(formRequest({ name: "Obras Públicas", acronym: "" }), context);

		expect(calls.created).toEqual([{ name: "Obras Públicas" }]);
	});

	test("un nombre demasiado corto falla sin llegar al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(formRequest({ name: "OP" }), context);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.created).toEqual([]);
	});

	// El nombre duplicado se pinta en SU campo: el usuario ve qué corregir sin
	// tener que adivinarlo desde un toast.
	test("el nombre duplicado aterriza en el campo del nombre", async () => {
		const { context } = createHarness({
			failWith: "DUPLICATE_DEPENDENCY_NAME",
		});

		const result = await run(formRequest({ name: "Obras Públicas" }), context);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.fieldErrors).toEqual({
				name: "Ya existe una dependencia con ese nombre",
			});
		}
	});

	test("un rol insuficiente corta antes de crear", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		const thrown = await run(
			formRequest({ name: "Obras Públicas" }),
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.created).toEqual([]);
	});
});
