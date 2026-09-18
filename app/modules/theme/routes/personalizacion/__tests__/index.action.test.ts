import { describe, expect, test } from "vitest";
import { themePreviewCookie } from "@/core/cookies.server";
import type { AppResponse } from "@/shared/response/response.types";
import type { Role } from "@/shared/rules/atoms.rules";
import { DEFAULT_THEME_TOKENS } from "../../../domain/theme.config";
import type { Theme } from "../../../domain/theme.types";
import {
	INTENT_FIELD,
	THEME_INTENTS,
	TOKENS_FIELD,
} from "../../../utils/theme-builder-form";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const theme: Theme = {
	documentId: DOCUMENT_ID,
	name: "Mi tema",
	isPreset: false,
	draftTokens: DEFAULT_THEME_TOKENS,
	publishedTokens: DEFAULT_THEME_TOKENS,
	publishedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const requestOf = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);

	return new Request("https://app.example.com/dashboard/personalizacion", {
		method: "POST",
		body,
	});
};

/** Toda operación del servicio devuelve el mismo envelope: uno solo basta. */
const createHarness = (
	options: { role?: Role | null; fails?: boolean } = {},
) => {
	const calls: Array<[string, unknown]> = [];

	const record = (name: string, data: unknown) => async (input: unknown) => {
		calls.push([name, input]);
		if (options.fails) {
			return {
				success: false as const,
				error: { code: "THEME_NOT_FOUND", message: "técnico" },
				timestamp: new Date().toISOString(),
			};
		}
		return {
			success: true as const,
			data,
			timestamp: new Date().toISOString(),
		};
	};

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "SUPERADMIN",
						iat: 1_800_000_000,
					},
		themeService: {
			createTheme: record("createTheme", theme),
			cloneTheme: record("cloneTheme", theme),
			renameTheme: record("renameTheme", null),
			saveDraft: record("saveDraft", null),
			importThemeCss: record("importThemeCss", theme),
			publishTheme: record("publishTheme", null),
			activateTheme: record("activateTheme", null),
			discardDraft: record("discardDraft", null),
			deleteTheme: record("deleteTheme", null),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (fields: Record<string, string>, context: ActionArgs["context"]) =>
	action({ request: requestOf(fields), context, params: {} } as ActionArgs);

const bodyOf = async (response: Response) =>
	(await response.json()) as AppResponse<null>;

const previewCookie = (response: Response) =>
	response.headers.getSetCookie().find((c) => c.startsWith("__theme_preview="));

describe("guard", () => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	test("a non-superadmin gets a 403 before anything is called", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		await expect(
			run(
				{ [INTENT_FIELD]: THEME_INTENTS.publish, documentId: DOCUMENT_ID },
				context,
			),
		).rejects.toMatchObject({ init: { status: 403 } });

		expect(calls).toEqual([]);
	});
});

describe("intenciones", () => {
	test("create passes the name through", async () => {
		const { context, calls } = createHarness();

		const response = await run(
			{ [INTENT_FIELD]: THEME_INTENTS.create, name: "Nuevo" },
			context,
		);

		expect(calls).toEqual([["createTheme", { name: "Nuevo" }]]);
		expect((await bodyOf(response)).success).toBe(true);
	});

	// La pantalla abre el tema recién creado y pide su nombre; sin este dato de
	// vuelta tendría que adivinar cuál es diffando la biblioteca.
	test("create returns the documentId of the theme it just made", async () => {
		const { context } = createHarness();

		const body = await bodyOf(
			await run(
				{ [INTENT_FIELD]: THEME_INTENTS.create, name: "Nuevo" },
				context,
			),
		);

		expect(body.success).toBe(true);
		if (body.success) {
			expect(body.data).toEqual({ createdDocumentId: DOCUMENT_ID });
		}
	});

	test("create forwards the origin theme when there is one", async () => {
		const { context, calls } = createHarness();

		await run(
			{
				[INTENT_FIELD]: THEME_INTENTS.create,
				name: "Copia",
				fromDocumentId: DOCUMENT_ID,
			},
			context,
		);

		expect(calls[0]?.[1]).toEqual({
			name: "Copia",
			fromDocumentId: DOCUMENT_ID,
		});
	});

	// Duplicar también abre la copia en la pantalla, así que necesita el mismo
	// dato de vuelta que crear.
	test("clone returns the documentId of the copy", async () => {
		const { context } = createHarness();

		const body = await bodyOf(
			await run(
				{
					[INTENT_FIELD]: THEME_INTENTS.clone,
					documentId: DOCUMENT_ID,
					name: "Mi tema (copia)",
				},
				context,
			),
		);

		expect(body.success).toBe(true);
		if (body.success) {
			expect(body.data).toEqual({ createdDocumentId: DOCUMENT_ID });
		}
	});

	test("clone, rename, publish, activate, discard and delete reach their use case", async () => {
		const { context, calls } = createHarness();

		await run(
			{
				[INTENT_FIELD]: THEME_INTENTS.clone,
				documentId: DOCUMENT_ID,
				name: "Copia",
			},
			context,
		);
		await run(
			{
				[INTENT_FIELD]: THEME_INTENTS.rename,
				documentId: DOCUMENT_ID,
				name: "Otro",
			},
			context,
		);
		await run(
			{ [INTENT_FIELD]: THEME_INTENTS.publish, documentId: DOCUMENT_ID },
			context,
		);
		await run(
			{ [INTENT_FIELD]: THEME_INTENTS.activate, documentId: DOCUMENT_ID },
			context,
		);
		await run(
			{ [INTENT_FIELD]: THEME_INTENTS.discard, documentId: DOCUMENT_ID },
			context,
		);
		await run(
			{ [INTENT_FIELD]: THEME_INTENTS.delete, documentId: DOCUMENT_ID },
			context,
		);

		expect(calls.map(([name]) => name)).toEqual([
			"cloneTheme",
			"renameTheme",
			"publishTheme",
			"activateTheme",
			"discardDraft",
			"deleteTheme",
		]);
	});

	test("saveDraft parses the tokens out of the JSON field", async () => {
		const { context, calls } = createHarness();

		await run(
			{
				[INTENT_FIELD]: THEME_INTENTS.saveDraft,
				documentId: DOCUMENT_ID,
				[TOKENS_FIELD]: JSON.stringify(DEFAULT_THEME_TOKENS),
			},
			context,
		);

		expect(calls[0]?.[1]).toEqual({
			documentId: DOCUMENT_ID,
			tokens: DEFAULT_THEME_TOKENS,
		});
	});

	test("importCss forwards the pasted block", async () => {
		const { context, calls } = createHarness();

		await run(
			{
				[INTENT_FIELD]: THEME_INTENTS.importCss,
				documentId: DOCUMENT_ID,
				css: ":root { --primary: #fff; }",
			},
			context,
		);

		expect(calls[0]).toEqual([
			"importThemeCss",
			{ documentId: DOCUMENT_ID, css: ":root { --primary: #fff; }" },
		]);
	});
});

describe("validación de frontera", () => {
	// El campo de tokens llega como JSON desde el navegador: un JSON roto tiene
	// que morir aquí con el código de validación, no llegar a la base.
	test("a malformed tokens field is a VALIDATION_ERROR, and nothing is written", async () => {
		const { context, calls } = createHarness();

		const body = await bodyOf(
			await run(
				{
					[INTENT_FIELD]: THEME_INTENTS.saveDraft,
					documentId: DOCUMENT_ID,
					[TOKENS_FIELD]: "{no soy json",
				},
				context,
			),
		);

		expect(body.success).toBe(false);
		if (!body.success) expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("tokens with an impossible colour never reach the use case", async () => {
		const { context, calls } = createHarness();

		const body = await bodyOf(
			await run(
				{
					[INTENT_FIELD]: THEME_INTENTS.saveDraft,
					documentId: DOCUMENT_ID,
					[TOKENS_FIELD]: JSON.stringify({
						...DEFAULT_THEME_TOKENS,
						light: { ...DEFAULT_THEME_TOKENS.light, primary: "</style>" },
					}),
				},
				context,
			),
		);

		expect(body.success).toBe(false);
		expect(calls).toEqual([]);
	});

	test("a documentId that is not a uuid is rejected", async () => {
		const { context, calls } = createHarness();

		const body = await bodyOf(
			await run(
				{ [INTENT_FIELD]: THEME_INTENTS.publish, documentId: "no-es-uuid" },
				context,
			),
		);

		expect(body.success).toBe(false);
		expect(calls).toEqual([]);
	});

	test("an empty name is rejected", async () => {
		const { context, calls } = createHarness();

		const body = await bodyOf(
			await run({ [INTENT_FIELD]: THEME_INTENTS.create, name: "   " }, context),
		);

		expect(body.success).toBe(false);
		expect(calls).toEqual([]);
	});

	// Toda intención valida en la frontera ANTES de tocar el caso de uso. Si una
	// se saltara ese paso, un uuid inventado o un nombre vacío llegarían al
	// servicio y el fallo saldría con otro código.
	test.each([
		THEME_INTENTS.create,
		THEME_INTENTS.clone,
		THEME_INTENTS.rename,
		THEME_INTENTS.saveDraft,
		THEME_INTENTS.importCss,
		THEME_INTENTS.publish,
		THEME_INTENTS.activate,
		THEME_INTENTS.discard,
		THEME_INTENTS.delete,
		THEME_INTENTS.startPreview,
	])("%s rejects malformed input before calling anything", async (intent) => {
		const { context, calls } = createHarness();

		const body = await bodyOf(
			await run(
				{
					[INTENT_FIELD]: intent,
					documentId: "no-es-uuid",
					name: "   ",
					css: "   ",
					[TOKENS_FIELD]: "{roto",
				},
				context,
			),
		);

		expect(body.success).toBe(false);
		if (!body.success) expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("an unknown intent is a 400 and calls nothing", async () => {
		const { context, calls } = createHarness();

		const response = await run({ [INTENT_FIELD]: "hacer-magia" }, context);

		expect(response.status).toBe(400);
		expect((await bodyOf(response)).success).toBe(false);
		expect(calls).toEqual([]);
	});
});

describe("errores del caso de uso", () => {
	// Sin escalera de instanceof: el servicio devuelve el código estable y el
	// diccionario del módulo le pone la copia de usuario.
	test("a failing use case answers with its code and the user-facing copy", async () => {
		const { context } = createHarness({ fails: true });

		const body = await bodyOf(
			await run(
				{ [INTENT_FIELD]: THEME_INTENTS.publish, documentId: DOCUMENT_ID },
				context,
			),
		);

		expect(body.success).toBe(false);
		if (!body.success) {
			expect(body.error.code).toBe("THEME_NOT_FOUND");
			expect(body.error.message).toBe("Ese tema ya no existe.");
		}
	});

	test.each([
		THEME_INTENTS.create,
		THEME_INTENTS.clone,
		THEME_INTENTS.rename,
		THEME_INTENTS.saveDraft,
		THEME_INTENTS.importCss,
		THEME_INTENTS.publish,
		THEME_INTENTS.activate,
		THEME_INTENTS.discard,
		THEME_INTENTS.delete,
		THEME_INTENTS.startPreview,
	])(
		"%s surfaces the failure instead of pretending it worked",
		async (intent) => {
			const { context } = createHarness({ fails: true });

			const body = await bodyOf(
				await run(
					{
						[INTENT_FIELD]: intent,
						documentId: DOCUMENT_ID,
						name: "Algo",
						css: ":root { --primary: #fff; }",
						[TOKENS_FIELD]: JSON.stringify(DEFAULT_THEME_TOKENS),
					},
					context,
				),
			);

			expect(body.success).toBe(false);
		},
	);
});

describe("cookie de preview", () => {
	// Se guarda ANTES de encender la cookie: el preview sirve el borrador
	// PERSISTIDO, así que sin ese guardado se estaría probando lo anterior.
	test("starting a preview saves the draft first and then sets the cookie", async () => {
		const { context, calls } = createHarness();

		const response = await run(
			{
				[INTENT_FIELD]: THEME_INTENTS.startPreview,
				documentId: DOCUMENT_ID,
				[TOKENS_FIELD]: JSON.stringify(DEFAULT_THEME_TOKENS),
			},
			context,
		);

		expect(calls.map(([name]) => name)).toEqual(["saveDraft"]);

		const header = previewCookie(response)?.split(";")[0];
		expect(await themePreviewCookie.parse(header ?? "")).toBe(DOCUMENT_ID);
	});

	// La cookie es HttpOnly como la de modo: nadie la lee desde el cliente, el
	// loader raíz es quien la interpreta.
	test("the preview cookie stays server-only and is session-scoped", async () => {
		const { context } = createHarness();

		const cookie = previewCookie(
			await run(
				{
					[INTENT_FIELD]: THEME_INTENTS.startPreview,
					documentId: DOCUMENT_ID,
					[TOKENS_FIELD]: JSON.stringify(DEFAULT_THEME_TOKENS),
				},
				context,
			),
		);

		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).not.toContain("Max-Age");
	});

	test("stopping the preview clears the cookie without touching the service", async () => {
		const { context, calls } = createHarness();

		const response = await run(
			{ [INTENT_FIELD]: THEME_INTENTS.stopPreview },
			context,
		);

		expect(calls).toEqual([]);
		expect(previewCookie(response)).toContain("Max-Age=0");
	});

	// Seguir en preview tras activar daría una pantalla que miente sobre lo que
	// ven los demás.
	test("activating leaves the preview in the same movement", async () => {
		const { context } = createHarness();

		const response = await run(
			{ [INTENT_FIELD]: THEME_INTENTS.activate, documentId: DOCUMENT_ID },
			context,
		);

		expect(previewCookie(response)).toContain("Max-Age=0");
	});

	test("deleting a theme also leaves the preview", async () => {
		const { context } = createHarness();

		const response = await run(
			{ [INTENT_FIELD]: THEME_INTENTS.delete, documentId: DOCUMENT_ID },
			context,
		);

		expect(previewCookie(response)).toContain("Max-Age=0");
	});
});
