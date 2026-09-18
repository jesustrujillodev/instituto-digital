import { describe, expect, test } from "vitest";
import { themePreviewCookie } from "@/core/cookies.server";
import type { Role } from "@/shared/rules/atoms.rules";
import { DEFAULT_THEME_TOKENS } from "../../../domain/theme.config";
import type { Theme, ThemeSummary } from "../../../domain/theme.types";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const ACTIVE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const summary = (overrides: Partial<ThemeSummary>): ThemeSummary => ({
	documentId: ACTIVE_ID,
	name: "Activo",
	isPreset: false,
	isActive: false,
	isPublished: true,
	hasUnpublishedChanges: false,
	...overrides,
});

const detail = (documentId: string): Theme => ({
	documentId,
	name: `Tema ${documentId.slice(0, 1)}`,
	isPreset: false,
	draftTokens: DEFAULT_THEME_TOKENS,
	publishedTokens: DEFAULT_THEME_TOKENS,
	publishedAt: new Date("2026-08-01T00:00:00.000Z"),
});

const requestOf = async (query = "", previewId: string | null = null) => {
	const headers: Record<string, string> = {};
	if (previewId !== null) {
		headers.Cookie = (await themePreviewCookie.serialize(previewId)).split(
			";",
		)[0];
	}
	return new Request(
		`https://app.example.com/dashboard/personalizacion${query}`,
		{ headers },
	);
};

const createHarness = (
	options: {
		role?: Role | null;
		themes?: ThemeSummary[];
		listFails?: boolean;
		detailFails?: boolean;
	} = {},
) => {
	const calls = { getTheme: [] as string[] };

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
			listThemes: async () => {
				if (options.listFails) {
					return {
						success: false as const,
						error: { code: "UNEXPECTED_ERROR", message: "db caída" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data:
						options.themes ??
						([
							summary({ documentId: ACTIVE_ID, isActive: true }),
							summary({ documentId: OTHER_ID, name: "Otro" }),
						] as ThemeSummary[]),
					timestamp: new Date().toISOString(),
				};
			},
			getTheme: async ({ documentId }: { documentId: string }) => {
				calls.getTheme.push(documentId);
				if (options.detailFails) {
					return {
						success: false as const,
						error: { code: "THEME_NOT_FOUND", message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: detail(documentId),
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = async (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context, params: {} } as LoaderArgs);

describe("personalizacion loader", () => {
	// 🔒 El tema es de la plataforma: quien lo cambia lo cambia para todo el
	// mundo. Un USER recibe 403 real, no un redirect que borraría la URL.
	test("a non-superadmin gets a 403", async () => {
		const { context } = createHarness({ role: "DEPENDENCY_HEAD" });

		await expect(run(await requestOf(), context)).rejects.toMatchObject({
			init: { status: 403 },
		});
	});

	test("an anonymous visitor is sent to the login", async () => {
		const { context } = createHarness({ role: null });

		await expect(run(await requestOf(), context)).rejects.toMatchObject({
			status: 302,
		});
	});

	// El tema abierto viaja en la URL: la pantalla es enlazable y el botón atrás
	// hace lo esperado.
	test("opens the theme named in the query string", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf(`?tema=${OTHER_ID}`), context);

		expect(calls.getTheme).toEqual([OTHER_ID]);
	});

	test("opens the active theme when the query says nothing", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf(), context);

		expect(calls.getTheme).toEqual([ACTIVE_ID]);
	});

	// Un id que ya no existe no debe dejar la pantalla en blanco: se cae al
	// activo, que siempre está.
	test("ignores a theme id that is no longer in the library", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf("?tema=no-existe"), context);

		expect(calls.getTheme).toEqual([ACTIVE_ID]);
	});

	test("opens the first theme when none is active", async () => {
		const { context, calls } = createHarness({
			themes: [summary({ documentId: OTHER_ID }), summary({})],
		});

		await run(await requestOf(), context);

		expect(calls.getTheme).toEqual([OTHER_ID]);
	});

	// Biblioteca vacía = seed sin correr. La vista lo dice en vez de reventar.
	test("returns an empty state when the library has no themes", async () => {
		const { context, calls } = createHarness({ themes: [] });

		const result = await run(await requestOf(), context);

		expect(result.data.theme).toBeNull();
		expect(result.data.exportedCss).toBe("");
		expect(calls.getTheme).toEqual([]);
	});

	test("serialises the CSS the copy button hands over", async () => {
		const { context } = createHarness();

		const result = await run(await requestOf(), context);

		expect(result.data.exportedCss).toContain(":root {");
		expect(result.data.exportedCss).toContain(".dark {");
	});

	test("reports the preview cookie so the UI can offer to leave it", async () => {
		const { context } = createHarness();

		const result = await run(await requestOf("", ACTIVE_ID), context);

		expect(result.data.previewDocumentId).toBe(ACTIVE_ID);
	});

	test("reports no preview when the cookie is absent", async () => {
		const { context } = createHarness();

		const result = await run(await requestOf(), context);

		expect(result.data.previewDocumentId).toBeNull();
	});

	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary.
	test("throws with the mapped status when listing fails", async () => {
		const { context } = createHarness({ listFails: true });

		await expect(run(await requestOf(), context)).rejects.toBeDefined();
	});

	test("throws with the mapped status when the detail fails", async () => {
		const { context } = createHarness({ detailFails: true });

		await expect(run(await requestOf(), context)).rejects.toBeDefined();
	});
});
