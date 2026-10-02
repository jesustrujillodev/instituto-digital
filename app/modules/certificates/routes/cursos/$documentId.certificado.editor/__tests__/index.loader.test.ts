import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import {
	DEFAULT_CERTIFICATE_DESIGN,
	migrateV1ToV2,
} from "../../../../domain/design/design.presets";
import { LEGACY_DEFAULT_DESIGN_V1 } from "../../../../domain/design/design-v1.schema";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const NOW = new Date("2026-09-23T18:00:00.000Z");

const editorOf = (
	draft: unknown = DEFAULT_CERTIFICATE_DESIGN,
	status = "PUBLISHED",
) => ({
	course: {
		id: 7,
		documentId: COURSE_ID,
		status,
		title: "Seguridad en obra",
		description: null,
		dependencyName: "Obras Públicas",
		hours: 20,
	},
	record: { draft, published: null, publishedAt: null, exists: true },
	state: "never-published",
});

const createHarness = (
	options: ActorOptions & { editor?: unknown; logos?: unknown } = {},
) => {
	const order: string[] = [];
	const context = {
		authPayload: authPayloadOf(options),
		clock: { now: () => NOW },
		certificateService: {
			getEditor: async () => {
				order.push("editor");
				return options.editor ?? okReply(editorOf());
			},
		},
		certificateLogoService: {
			listForEditor: async () => {
				order.push("logos");
				return options.logos ?? okReply([]);
			},
		},
		certificateTemplateService: {
			list: async () => {
				order.push("templates");
				return okReply([]);
			},
		},
	} as unknown as LoaderArgs["context"];
	return { context, order };
};

const run = (context: LoaderArgs["context"]) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/capacitaciones/${COURSE_ID}/certificado/editor`,
		),
		context,
		params: { documentId: COURSE_ID },
	} as unknown as LoaderArgs);

describe("editor del certificado · loader", () => {
	test("abre el v2 guardado tal cual, con los logos", async () => {
		const { context, order } = createHarness();

		expect(await run(context)).toMatchObject({
			success: true,
			data: {
				design: DEFAULT_CERTIFICATE_DESIGN,
				migrated: false,
				canEdit: true,
				logos: [],
				templates: [],
				canCreateTemplates: true,
			},
		});
		// Certificado, logos y biblioteca no dependen entre sí: los tres se piden.
		expect(order.sort()).toEqual(["editor", "logos", "templates"]);
	});

	test("un borrador del gestor anterior se abre convertido", async () => {
		const { context } = createHarness({
			editor: okReply(editorOf(LEGACY_DEFAULT_DESIGN_V1)),
		});

		expect(await run(context)).toMatchObject({
			data: { design: migrateV1ToV2(LEGACY_DEFAULT_DESIGN_V1), migrated: true },
		});
	});

	test("un curso cancelado se abre de solo lectura", async () => {
		const { context } = createHarness({
			editor: okReply(editorOf(DEFAULT_CERTIFICATE_DESIGN, "CANCELLED")),
		});

		expect(await run(context)).toMatchObject({ data: { canEdit: false } });
	});

	test("un curso fuera de alcance responde 404", async () => {
		const { context } = createHarness({
			editor: failReply(CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND),
		});

		expect((await run(context).catch((error) => error)).init.status).toBe(404);
	});

	test("si los logos fallan, la pantalla no abre a medias", async () => {
		const { context } = createHarness({ logos: failReply("UNEXPECTED_ERROR") });

		expect((await run(context).catch((error) => error)).init.status).toBe(500);
	});

	test("un capacitador interno aplica plantillas pero no las crea", async () => {
		const { context } = createHarness({ role: "USER", isTrainer: true });

		expect(await run(context)).toMatchObject({
			data: { canCreateTemplates: false },
		});
	});

	test("un participante sin perfil de capacitador recibe 403", async () => {
		const { context, order } = createHarness({ role: "USER" });

		expect((await run(context).catch((error) => error)).init.status).toBe(403);
		expect(order).toEqual([]);
	});
});
