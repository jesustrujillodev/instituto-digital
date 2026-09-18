import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { CLOUD_ERROR_CODES } from "../../../domain/cloud.errors";
import { CLOUD_INTENTS, INTENT_FIELD } from "../../../utils/cloud-intents";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const okOf = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

const formRequest = (fields: [string, string][]) => {
	const body = new FormData();
	for (const [key, value] of fields) body.append(key, value);

	return new Request("https://app.example.com/dashboard/nube", {
		method: "POST",
		body,
	});
};

const createHarness = (options: { role?: Role; failWith?: string } = {}) => {
	const calls: [string, unknown[]][] = [];
	const respond =
		<T>(name: string, data: T) =>
		async (...args: unknown[]) => {
			calls.push([name, args]);
			return options.failWith
				? {
						success: false as const,
						error: { code: options.failWith, message: "técnico" },
						timestamp: new Date().toISOString(),
					}
				: okOf(data);
		};

	const context = {
		authPayload: {
			sub: "11111111-1111-4111-8111-111111111111",
			userId: 7,
			email: "admin@test.com",
			role: options.role ?? "SUPERADMIN",
			iat: 1_800_000_000,
		},
		cloudService: {
			downloadUrl: respond("downloadUrl", { url: "https://firmada" }),
			zipManifest: respond("zipManifest", {
				fileName: "cursos.zip",
				totalBytes: 1,
				entries: [],
			}),
			previewDelete: respond("previewDelete", {
				objectCount: 1,
				totalBytes: 1,
				owners: [],
			}),
			delete: respond("delete", { deleted: 2, failed: [], released: 1 }),
			scanOrphans: respond("scanOrphans", {
				prefix: "",
				scanned: 0,
				truncated: false,
				orphans: [],
			}),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("nube action — guard", () => {
	test("un rol insuficiente corta con 403 antes de tocar el servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			formRequest([[INTENT_FIELD, CLOUD_INTENTS.delete]]),
			context,
		).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});
});

describe("nube action — intents", () => {
	test("download firma la key pedida", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest([
				[INTENT_FIELD, CLOUD_INTENTS.download],
				["key", "media/cursos/frente.jpg"],
			]),
			context,
		);

		expect(result).toMatchObject({
			success: true,
			data: { intent: CLOUD_INTENTS.download, url: "https://firmada" },
		});
		expect(calls).toEqual([["downloadUrl", ["media/cursos/frente.jpg"]]]);
	});

	test("zip-manifest recibe keys y carpetas repetidas", async () => {
		const { context, calls } = createHarness();

		await run(
			formRequest([
				[INTENT_FIELD, CLOUD_INTENTS.zipManifest],
				["key", "media/a.jpg"],
				["prefix", "media/cursos/"],
				["prefix", "media/avisos/"],
			]),
			context,
		);

		expect(calls).toEqual([
			[
				"zipManifest",
				[
					{
						keys: ["media/a.jpg"],
						prefixes: ["media/cursos/", "media/avisos/"],
					},
				],
			],
		]);
	});

	test("delete pasa quién borra y anuncia el resultado", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest([
				[INTENT_FIELD, CLOUD_INTENTS.delete],
				["prefix", "media/cursos/"],
			]),
			context,
		);

		expect(calls[0]).toEqual([
			"delete",
			[{ keys: [], prefixes: ["media/cursos/"] }, { userId: 7 }],
		]);
		expect(result).toMatchObject({
			success: true,
			message: "Se eliminaron 2 archivos",
		});
	});

	test("una selección con la raíz o con .. no llega al servicio", async () => {
		const { context, calls } = createHarness();

		for (const prefix of ["", "media/../"]) {
			const result = await run(
				formRequest([
					[INTENT_FIELD, CLOUD_INTENTS.delete],
					["prefix", prefix],
				]),
				context,
			);
			expect(result.success).toBe(false);
		}
		expect(calls).toEqual([]);
	});

	test("scan-orphans acepta la raíz", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			formRequest([[INTENT_FIELD, CLOUD_INTENTS.scanOrphans]]),
			context,
		);

		expect(result.success).toBe(true);
		expect(calls).toEqual([["scanOrphans", [""]]]);
	});

	test("los fallos del servicio salen con copia de usuario y su código", async () => {
		const { context } = createHarness({
			failWith: CLOUD_ERROR_CODES.NOTHING_SELECTED,
		});

		const result = await run(
			formRequest([
				[INTENT_FIELD, CLOUD_INTENTS.deletePreview],
				["key", "media/a.jpg"],
			]),
			context,
		);

		expect(result).toMatchObject({
			success: false,
			error: {
				code: CLOUD_ERROR_CODES.NOTHING_SELECTED,
				message: "Los archivos seleccionados ya no existen.",
			},
		});
	});

	test("una intención desconocida es un error de validación", async () => {
		const { context } = createHarness();

		const result = await run(
			formRequest([[INTENT_FIELD, "formatear"]]),
			context,
		);

		expect(result.success).toBe(false);
	});
});
