import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { toProxyRef } from "@/shared/storage/public-url";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import type {
	CertificateCourse,
	CertificateDesignV2,
	CertificateTemplate,
	InstitutionalLogo,
	NewCertificateTemplate,
} from "../../domain/certificate.types";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../domain/design/design.presets";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import { createCertificateTemplateService } from "../certificate-templates.service.server";

const NOW = new Date("2026-10-01T18:00:00.000Z");
const COURSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEMPLATE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 9,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "titular@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const LOGO = DEFAULT_CERTIFICATE_DESIGN.elements.find(
	(e) => e.id === "logo",
) as DesignElement;
const courseImage = (file: string, role: "image" | "signature" = "image") =>
	({
		...LOGO,
		id: `img-${file.replace(/\W/g, "")}`,
		src: {
			kind: "asset",
			ref: toProxyRef(`documentos/certificados/${COURSE}/imagenes/${file}`),
			role,
		},
	}) as DesignElement;

const designWith = (...extra: DesignElement[]): CertificateDesignV2 => ({
	...DEFAULT_CERTIFICATE_DESIGN,
	elements: [...DEFAULT_CERTIFICATE_DESIGN.elements, ...extra],
});

const templateOf = (
	overrides: Partial<CertificateTemplate> = {},
): CertificateTemplate => ({
	documentId: TEMPLATE,
	name: "Institucional 2026",
	description: null,
	scope: "DEPENDENCY",
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	design: DEFAULT_CERTIFICATE_DESIGN,
	archivedAt: null,
	updatedAt: NOW,
	...overrides,
});

const courseOf = (
	status: CertificateCourse["status"] = "PUBLISHED",
): CertificateCourse => ({
	id: 7,
	documentId: COURSE,
	status,
	title: "Seguridad en obra",
	description: null,
	dependencyName: "Obras Públicas",
	hours: 20,
});

const createHarness = (
	options: {
		templates?: CertificateTemplate[];
		course?: CertificateCourse | null;
		logos?: InstitutionalLogo[];
		/** Keys que ya no están en storage. */
		missing?: string[];
	} = {},
) => {
	const templates = options.templates ?? [templateOf()];
	const calls = {
		created: [] as (NewCertificateTemplate & { documentId: string })[],
		saved: [] as {
			documentId: string;
			design: CertificateDesignV2;
			by: number | null;
		}[],
		renamed: [] as unknown[][],
		archived: [] as { documentId: string; at: Date | null }[],
		read: [] as string[],
		written: [] as string[],
		listed: [] as unknown[],
	};

	const certificateTemplateRepository = {
		listVisible: async (visibility: unknown, includeArchived: boolean) => {
			calls.listed.push({ visibility, includeArchived });
			return templates;
		},
		findByDocumentId: async (id: string) =>
			templates.find((template) => template.documentId === id) ?? null,
		create: async (
			template: NewCertificateTemplate & { documentId: string },
		) => {
			calls.created.push(template);
			return templateOf({
				...template,
				dependencyName: null,
				archivedAt: null,
			});
		},
		saveDesign: async (
			documentId: string,
			design: CertificateDesignV2,
			by: number | null,
		) => {
			calls.saved.push({ documentId, design, by });
		},
		rename: async (...args: unknown[]) => {
			calls.renamed.push(args);
		},
		setArchived: async (documentId: string, at: Date | null) => {
			calls.archived.push({ documentId, at });
		},
	} as unknown as ICradle["certificateTemplateRepository"];

	const certificateRepository = {
		findCourse: async () =>
			options.course === undefined ? courseOf() : options.course,
	} as unknown as ICradle["certificateRepository"];

	const certificateLogoRepository = {
		findByDocumentIds: async (ids: readonly string[]) =>
			(options.logos ?? []).filter((logo) => ids.includes(logo.documentId)),
	} as unknown as ICradle["certificateLogoRepository"];

	const storageProvider = {
		getFile: async (_bucket: string, key: string) => {
			calls.read.push(key);
			return Buffer.from("x");
		},
		uploadFile: async (_bucket: string, key: string) => {
			calls.written.push(key);
		},
		fileExists: async (_bucket: string, key: string) =>
			!(options.missing ?? []).includes(key),
	} as unknown as ICradle["storageProvider"];

	const service = createCertificateTemplateService({
		certificateTemplateRepository,
		certificateRepository,
		certificateLogoRepository,
		certificatePdfTools: {} as ICradle["certificatePdfTools"],
		storageProvider,
		storageBucket: "privado",
		storagePublicBucket: "publico",
		clock: { now: () => NOW },
		logger: silentLogger,
	});
	return { service, calls };
};

describe("certificateTemplateService.list", () => {
	test("marca cuáles puede editar y oculta las archivadas que no administra", async () => {
		const { service } = createHarness({
			templates: [
				templateOf(),
				templateOf({
					documentId: "inst",
					scope: "INSTITUTIONAL",
					dependencyId: null,
				}),
				templateOf({
					documentId: "inst-archivada",
					scope: "INSTITUTIONAL",
					dependencyId: null,
					archivedAt: NOW,
				}),
			],
		});

		const result = await service.list(actorOf(), { includeArchived: true });

		expect(result).toMatchObject({
			success: true,
			data: [
				{ documentId: TEMPLATE, canEdit: true },
				{ documentId: "inst", canEdit: false },
			],
		});
	});

	test("quien no administra cursos recibe una lista vacía sin consultar", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.list(actorOf({ role: "USER" }), { includeArchived: false }),
		).toMatchObject({ success: true, data: [] });
		expect(calls.listed).toEqual([]);
	});
});

describe("certificateTemplateService.create", () => {
	test("nace en la dependencia de quien la crea, con el diseño institucional", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			{ name: "Nueva", description: "" },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.created[0]).toMatchObject({
			name: "Nueva",
			description: null,
			scope: "DEPENDENCY",
			dependencyId: 3,
			design: DEFAULT_CERTIFICATE_DESIGN,
			createdById: 9,
		});
		expect(calls.created[0].documentId).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("un capacitador interno no crea plantillas", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.create(
				{ name: "X", description: null },
				actorOf({ role: "USER", isTrainer: true }),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.FORBIDDEN } });
		expect(calls.created).toEqual([]);
	});
});

describe("guardar, renombrar y archivar", () => {
	test("guarda el diseño sin firmas y con solo recursos propios", async () => {
		const { service, calls } = createHarness();
		const ownImage = {
			...LOGO,
			id: "sello",
			src: {
				kind: "asset",
				ref: toProxyRef(
					`documentos/plantillas-certificado/${TEMPLATE}/imagenes/s.png`,
				),
				role: "image",
			},
		} as DesignElement;

		const result = await service.saveDesign(
			{ documentId: TEMPLATE, design: designWith(ownImage) },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.saved[0].by).toBe(9);
		expect(calls.saved[0].design.elements.some((e) => e.id === "sello")).toBe(
			true,
		);
	});

	test("una imagen nueva que ya no está en storage no se guarda", async () => {
		const key = `documentos/plantillas-certificado/${TEMPLATE}/imagenes/s.png`;
		const { service, calls } = createHarness({ missing: [key] });
		const image = {
			...LOGO,
			id: "sello",
			src: { kind: "asset", ref: toProxyRef(key), role: "image" },
		} as DesignElement;

		expect(
			await service.saveDesign(
				{ documentId: TEMPLATE, design: designWith(image) },
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_MISSING },
		});
		expect(calls.saved).toEqual([]);
	});

	test("rechaza imágenes de un curso en el diseño de una plantilla", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.saveDesign(
				{ documentId: TEMPLATE, design: designWith(courseImage("a.png")) },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED },
		});
		expect(calls.saved).toEqual([]);
	});

	test("una plantilla de otra dependencia responde como inexistente", async () => {
		const { service, calls } = createHarness({
			templates: [templateOf({ dependencyId: 4 })],
		});

		expect(
			await service.rename(
				{ documentId: TEMPLATE, name: "X", description: null },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.TEMPLATE_NOT_FOUND },
		});
		expect(calls.renamed).toEqual([]);
	});

	test("una institucional se ve pero no se cambia desde una dependencia", async () => {
		const { service, calls } = createHarness({
			templates: [templateOf({ scope: "INSTITUTIONAL", dependencyId: null })],
		});

		expect(await service.setArchived(TEMPLATE, true, actorOf())).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.FORBIDDEN },
		});
		expect(calls.archived).toEqual([]);
		expect((await service.get(TEMPLATE, actorOf())).success).toBe(true);
	});

	test("renombra y archiva lo propio", async () => {
		const { service, calls } = createHarness();

		await service.rename(
			{ documentId: TEMPLATE, name: "Otro", description: "" },
			actorOf(),
		);
		await service.setArchived(TEMPLATE, true, actorOf());
		await service.setArchived(TEMPLATE, false, actorOf());

		expect(calls.renamed).toEqual([[TEMPLATE, "Otro", null, 9]]);
		expect(calls.archived).toEqual([
			{ documentId: TEMPLATE, at: NOW },
			{ documentId: TEMPLATE, at: null },
		]);
	});
});

describe("certificateTemplateService.fromCourse", () => {
	test("copia las imágenes del curso a la plantilla y deja fuera las firmas", async () => {
		const { service, calls } = createHarness();
		const design = designWith(
			courseImage("sello.png"),
			courseImage("firma.png", "signature"),
		);

		const result = await service.fromCourse(
			{
				courseDocumentId: COURSE,
				name: "Desde curso",
				description: null,
				design,
			},
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.read).toEqual([
			`documentos/certificados/${COURSE}/imagenes/sello.png`,
		]);
		const [created] = calls.created;
		expect(calls.written[0]).toMatch(
			new RegExp(
				`^documentos/plantillas-certificado/${created.documentId}/imagenes/sello-[0-9a-f]{32}\\.png$`,
			),
		);
		const refs = created.design.elements.flatMap((e) =>
			e.type === "image" && e.src.kind === "asset" ? [e.src.ref] : [],
		);
		expect(refs).toEqual([toProxyRef(calls.written[0])]);
	});

	test("no copia objetos que no son del propio curso", async () => {
		const { service, calls } = createHarness();
		const foreign = {
			...courseImage("x.png"),
			src: {
				kind: "asset",
				ref: toProxyRef("documentos/certificados/otro/imagenes/x.png"),
				role: "image",
			},
		} as DesignElement;

		expect(
			await service.fromCourse(
				{
					courseDocumentId: COURSE,
					name: "X",
					description: null,
					design: designWith(foreign),
				},
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED },
		});
		expect(calls.read).toEqual([]);
		expect(calls.created).toEqual([]);
	});

	test("un logo archivado no entra a una plantilla nueva", async () => {
		const logoId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
		const { service } = createHarness({
			logos: [
				{
					documentId: logoId,
					name: "Viejo",
					storageKey: "media/logos/v.png",
					contentType: "image/png",
					widthPx: 1,
					heightPx: 1,
					archivedAt: NOW,
					createdAt: NOW,
					previousDocumentId: null,
				},
			],
		});
		const design = designWith({
			...LOGO,
			id: "viejo",
			src: { kind: "logo", logoId },
		} as DesignElement);

		expect(
			await service.fromCourse(
				{ courseDocumentId: COURSE, name: "X", description: null, design },
				actorOf(),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.LOGO_ARCHIVED } });
	});

	test("un curso cancelado o ajeno no se usa", async () => {
		const cancelled = createHarness({ course: courseOf("CANCELLED") });
		expect(
			await cancelled.service.fromCourse(
				{
					courseDocumentId: COURSE,
					name: "X",
					description: null,
					design: DEFAULT_CERTIFICATE_DESIGN,
				},
				actorOf(),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.NOT_EDITABLE } });

		const missing = createHarness({ course: null });
		expect(
			await missing.service.fromCourse(
				{
					courseDocumentId: COURSE,
					name: "X",
					description: null,
					design: DEFAULT_CERTIFICATE_DESIGN,
				},
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});
});

describe("certificateTemplateService.apply", () => {
	const TEMPLATE_PDF = `documentos/plantillas-certificado/${TEMPLATE}/fondos/f.pdf`;
	const templateBackground = {
		...LOGO,
		id: "sello",
		src: { kind: "asset", ref: toProxyRef(TEMPLATE_PDF), role: "image" },
	} as DesignElement;

	test("devuelve el diseño con sus recursos copiados a la carpeta del curso", async () => {
		const { service, calls } = createHarness({
			templates: [templateOf({ design: designWith(templateBackground) })],
		});

		const result = await service.apply(
			{ courseDocumentId: COURSE, templateDocumentId: TEMPLATE },
			actorOf(),
		);

		expect(calls.written[0]).toMatch(
			new RegExp(
				`^documentos/certificados/${COURSE}/fondos/f-[0-9a-f]{32}\\.pdf$`,
			),
		);
		expect(
			result.success && result.data.elements.find((e) => e.id === "sello"),
		).toMatchObject({
			src: { ref: toProxyRef(calls.written[0]) },
		});
	});

	// Aplicar dos veces la misma plantilla no deja copias huérfanas.
	test("aplicarla otra vez reescribe las mismas copias", async () => {
		const { service, calls } = createHarness({
			templates: [templateOf({ design: designWith(templateBackground) })],
		});
		const apply = () =>
			service.apply(
				{ courseDocumentId: COURSE, templateDocumentId: TEMPLATE },
				actorOf(),
			);

		const [first, second] = [await apply(), await apply()];

		expect(calls.written).toHaveLength(2);
		expect(calls.written[0]).toBe(calls.written[1]);
		expect(first.success && first.data).toEqual(second.success && second.data);
	});

	test("un recurso de la plantilla que ya no está en storage no se copia", async () => {
		const { service, calls } = createHarness({
			templates: [templateOf({ design: designWith(templateBackground) })],
			missing: [TEMPLATE_PDF],
		});

		expect(
			await service.apply(
				{ courseDocumentId: COURSE, templateDocumentId: TEMPLATE },
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_MISSING },
		});
		expect(calls.written).toEqual([]);
	});

	test("una plantilla archivada no se aplica", async () => {
		const { service } = createHarness({
			templates: [templateOf({ archivedAt: NOW })],
		});

		expect(
			await service.apply(
				{ courseDocumentId: COURSE, templateDocumentId: TEMPLATE },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.TEMPLATE_NOT_FOUND },
		});
	});
});
