import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	CERTIFICATE_ERROR_CODES,
	CertificateBackgroundInvalidError,
	CertificateExportUnavailableError,
} from "../../domain/certificate.errors";
import type {
	CertificateCourse,
	CertificateDelivery,
	CertificateDesign,
	CertificateDesignV2,
	CertificateIssueRecord,
	CertificateRecord,
	InstitutionalLogo,
	MyIssueRecord,
	VerifiableIssue,
} from "../../domain/certificate.types";
import type {
	AssetManifest,
	ExportProfile,
} from "../../domain/design/design.assets";
import {
	DEFAULT_CERTIFICATE_DESIGN,
	PRESETS,
} from "../../domain/design/design.presets";
import { LEGACY_DEFAULT_DESIGN_V1 } from "../../domain/design/design-v1.schema";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import { createCertificateService } from "../certificates.service.server";

const COURSE_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_DOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOGO_DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = new Date("2026-09-23T18:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 99,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "titular@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const courseOf = (
	overrides: Partial<CertificateCourse> = {},
): CertificateCourse => ({
	id: 7,
	documentId: COURSE_DOC,
	status: "PUBLISHED",
	title: "Seguridad en obra",
	description: null,
	dependencyName: "Secretaría de Obras Públicas",
	hours: 20,
	...overrides,
});

const recordOf = (
	overrides: Partial<CertificateRecord> = {},
): CertificateRecord => ({
	draft: DEFAULT_CERTIFICATE_DESIGN,
	published: null,
	publishedAt: null,
	exists: false,
	...overrides,
});

const LOGO = PRESETS.institucional.elements.find(
	(e) => e.id === "logo",
) as DesignElement;
const TEXT = PRESETS.institucional.elements.find(
	(e) => e.id === "otorga",
) as DesignElement;

const withElements = (...extra: DesignElement[]): CertificateDesignV2 => ({
	...DEFAULT_CERTIFICATE_DESIGN,
	elements: [...DEFAULT_CERTIFICATE_DESIGN.elements, ...extra],
});

const imageRef = (course: string, file = "a.png") =>
	toProxyRef(`documentos/certificados/${course}/imagenes/${file}`);

const withImage = (ref: string) =>
	withElements({
		...LOGO,
		id: "img",
		src: { kind: "asset", ref, role: "image" },
	} as DesignElement);

const withLogo = (logoId: string) =>
	withElements({
		...LOGO,
		id: "otro-logo",
		src: { kind: "logo", logoId },
	} as DesignElement);

const withText = (content: string) =>
	withElements({ ...TEXT, id: "marca", content } as DesignElement);

const logoOf = (
	overrides: Partial<InstitutionalLogo> = {},
): InstitutionalLogo => ({
	documentId: LOGO_DOC,
	name: "Logo a color",
	storageKey: "media/logos/color-1.png",
	contentType: "image/png",
	widthPx: 600,
	heightPx: 200,
	archivedAt: null,
	createdAt: NOW,
	previousDocumentId: null,
	...overrides,
});

/** Un v1 emitido con firma: así se sigue descargando lo de antes. */
const v1WithSignature = (ref: string | null): CertificateDesign => ({
	...LEGACY_DEFAULT_DESIGN_V1,
	signatories: [
		{ ...LEGACY_DEFAULT_DESIGN_V1.signatories[0], signatureUrl: ref },
		LEGACY_DEFAULT_DESIGN_V1.signatories[1],
	],
});

const ISSUE_DOC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const issueOf = (
	overrides: Partial<CertificateIssueRecord> = {},
): CertificateIssueRecord => ({
	documentId: ISSUE_DOC,
	courseId: 7,
	folio: "2026-0042",
	revokedAt: null,
	design: v1WithSignature(
		toProxyRef(`documentos/firmas/${COURSE_DOC}/firma-1.png`),
	),
	data: {
		recipientName: "Ana Ruiz",
		courseTitle: "Seguridad en obra",
		courseDescription: "",
		dependencyName: "Secretaría de Obras Públicas",
		hours: "20 horas",
		issuedOn: "10 de marzo de 2026",
		folio: "2026-0042",
	},
	...overrides,
});

/** Lo justo de un PNG para que se reconozca y se midan sus lados. */
const pngBytes = (width: number, height: number) => {
	const bytes = new Uint8Array(33);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
	bytes.set([0x49, 0x48, 0x44, 0x52], 12);
	new DataView(bytes.buffer).setUint32(16, width);
	new DataView(bytes.buffer).setUint32(20, height);
	return bytes;
};

const fileOf = (
	bytes: Uint8Array,
	overrides: Partial<{ name: string; type: string; size: number }> = {},
) => ({
	name: "imagen.png",
	type: "image/png",
	size: bytes.byteLength,
	arrayBuffer: async () => bytes.slice().buffer,
	...overrides,
});

const text = (value: string) => new TextEncoder().encode(value);

const PDF_BACKGROUND = {
	kind: "pdf",
	pdfRef: toProxyRef(`documentos/certificados/${COURSE_DOC}/fondos/f.pdf`),
	rasterRef: toProxyRef(`documentos/certificados/${COURSE_DOC}/fondos/f.webp`),
	rasterDpi: 300,
	widthPt: 841.89,
	heightPt: 595.28,
} as const;

const createHarness = (
	options: {
		course?: CertificateCourse | null;
		record?: CertificateRecord;
		bucket?: string | null;
		issue?: CertificateIssueRecord | null;
		verifiable?: VerifiableIssue | null;
		mine?: MyIssueRecord | null;
		exporterUnavailable?: boolean;
		logos?: InstitutionalLogo[];
		sanitizeError?: CertificateBackgroundInvalidError;
		/** Keys que ya no están en storage. */
		missing?: string[];
	} = {},
) => {
	const calls = {
		findCourse: [] as { documentId: string; where: unknown }[],
		saved: [] as { courseId: number; design: CertificateDesign }[],
		published: [] as {
			courseId: number;
			design: CertificateDesign;
			at: Date;
		}[],
		uploaded: [] as { bucket: string; key: string; type?: string }[],
		existsChecked: [] as string[],
		findIssue: [] as { documentId: string; where: unknown }[],
		assets: [] as { manifest: AssetManifest; logos: unknown }[],
		backgrounds: [] as string[],
		exported: [] as { html: string; format: string; profile: ExportProfile }[],
		overlays: 0,
		deliveries: [] as { courseId: number; delivery: CertificateDelivery }[],
		mineFor: [] as number[],
		mineTake: [] as (number | undefined)[],
		myIssueFor: [] as { documentId: string; userId: number }[],
	};

	const certificateRepository = {
		findCourse: async (documentId: string, where: unknown) => {
			calls.findCourse.push({ documentId, where });
			return options.course === undefined ? courseOf() : options.course;
		},
		findRecord: async () => options.record ?? recordOf(),
		findDelivery: async () => ({ isDownloadable: true, emailMessage: null }),
		saveDelivery: async (courseId: number, delivery: CertificateDelivery) => {
			calls.deliveries.push({ courseId, delivery });
		},
		findMine: async (userId: number, take?: number) => {
			calls.mineFor.push(userId);
			calls.mineTake.push(take);
			return [
				{ documentId: ISSUE_DOC, data: issueOf().data, downloadable: true },
			];
		},
		findMyIssue: async (documentId: string, userId: number) => {
			calls.myIssueFor.push({ documentId, userId });
			return options.mine === undefined
				? {
						documentId: ISSUE_DOC,
						design: issueOf().design,
						data: issueOf().data,
						downloadable: true,
					}
				: options.mine;
		},
		findIssueForVerification: async () =>
			options.verifiable === undefined
				? { folio: "2026-0042", revokedAt: null, data: issueOf().data }
				: options.verifiable,
		findIssue: async (documentId: string, where: unknown) => {
			calls.findIssue.push({ documentId, where });
			return options.issue === undefined ? issueOf() : options.issue;
		},
		saveDraft: async (courseId: number, design: CertificateDesign) => {
			calls.saved.push({ courseId, design });
		},
		publish: async (courseId: number, design: CertificateDesign, at: Date) => {
			calls.published.push({ courseId, design, at });
		},
	} as unknown as ICradle["certificateRepository"];

	const certificateLogoRepository = {
		findByDocumentIds: async (ids: readonly string[]) =>
			(options.logos ?? []).filter((logo) => ids.includes(logo.documentId)),
	} as unknown as ICradle["certificateLogoRepository"];

	const storageProvider = {
		uploadFile: async (
			bucket: string,
			key: string,
			_body: unknown,
			type?: string,
		) => {
			calls.uploaded.push({ bucket, key, type });
		},
		fileExists: async (_bucket: string, key: string) => {
			calls.existsChecked.push(key);
			return !(options.missing ?? []).includes(key);
		},
	} as unknown as ICradle["storageProvider"];

	const certificateAssetSource = {
		load: async (manifest: AssetManifest, logos: unknown) => {
			calls.assets.push({ manifest, logos });
			return {
				fonts: {
					XLt: "data:f",
					Bk: "data:f",
					Md: "data:f",
					Demi: "data:f",
					Bold: "data:f",
				},
				logo: "data:image/png;base64,TE9HTw==",
				faces: Object.fromEntries(
					manifest.faces.map((face) => [face, "data:font"]),
				),
				logos: Object.fromEntries(
					manifest.logoIds.map((id) => [id, "data:logo"]),
				),
				images: Object.fromEntries(
					manifest.imageRefs.map((ref) => [
						ref,
						"data:image/png;base64,RklSTUE=",
					]),
				),
			};
		},
		loadBackgroundPdf: async (ref: string) => {
			calls.backgrounds.push(ref);
			return new Uint8Array([1]);
		},
	} as unknown as ICradle["certificateAssetSource"];

	const certificateExporter = {
		export: async (html: string, profile: ExportProfile) => {
			if (options.exporterUnavailable) {
				throw new CertificateExportUnavailableError();
			}
			calls.exported.push({ html, format: profile.format, profile });
			return new Uint8Array([37, 80, 68, 70]);
		},
	} as unknown as ICradle["certificateExporter"];

	const certificatePdfTools = {
		sanitize: async () => {
			if (options.sanitizeError) throw options.sanitizeError;
			return { bytes: new Uint8Array([2]), widthPt: 841.89, heightPt: 595.28 };
		},
		overlay: async () => {
			calls.overlays++;
			return new Uint8Array([9, 9]);
		},
	} as unknown as ICradle["certificatePdfTools"];

	const service = createCertificateService({
		certificateRepository,
		certificateAssetSource,
		certificateExporter,
		certificateLogoRepository,
		certificatePdfTools,
		appBaseUrl: "https://capacitacion.test",
		clock: { now: () => NOW },
		logger: silentLogger,
		storageProvider,
		storageBucket: options.bucket === undefined ? "privado" : options.bucket,
		storagePublicBucket: "publico",
	});

	return { service, calls };
};

describe("certificateService.getEditor", () => {
	test("devuelve el curso, el diseño guardado y su estado", async () => {
		const { service } = createHarness();

		const result = await service.getEditor(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: {
				course: { title: "Seguridad en obra", hours: 20 },
				record: { exists: false },
				state: "never-published",
			},
		});
	});

	test("un curso fuera de alcance responde como inexistente", async () => {
		const { service } = createHarness({ course: null });

		expect(await service.getEditor(COURSE_DOC, actorOf())).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});

	test("sin alcance de cursos ni se consulta el curso", async () => {
		const { service, calls } = createHarness();

		const result = await service.getEditor(
			COURSE_DOC,
			actorOf({ role: "USER", isTrainer: false, dependencyId: null }),
		);

		expect(result).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.findCourse).toEqual([]);
	});

	test("un capacitador interno busca con su alcance de autor", async () => {
		const { service, calls } = createHarness();

		await service.getEditor(
			COURSE_DOC,
			actorOf({ role: "USER", isTrainer: true }),
		);

		expect(calls.findCourse[0].where).toMatchObject({ createdById: 99 });
	});
});

describe("certificateService.saveDraft", () => {
	test("guarda el borrador con una imagen propia", async () => {
		const { service, calls } = createHarness();
		const design = withImage(imageRef(COURSE_DOC));

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.saved).toEqual([{ courseId: 7, design }]);
	});

	test("acepta las firmas del gestor anterior de su propio curso", async () => {
		const { service, calls } = createHarness();
		const ref = toProxyRef(`documentos/firmas/${COURSE_DOC}/firma-1.png`);

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: withImage(ref) },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.saved).toHaveLength(1);
	});

	test.each([
		["una imagen de otro curso", withImage(imageRef(OTHER_DOC))],
		[
			"un fondo de otro curso",
			{
				...DEFAULT_CERTIFICATE_DESIGN,
				background: {
					...PDF_BACKGROUND,
					pdfRef: toProxyRef(
						`documentos/certificados/${OTHER_DOC}/fondos/f.pdf`,
					),
				},
			} as CertificateDesignV2,
		],
		[
			"una URL que no es del proxy",
			withImage("/api/storage?key=documentos/x.png"),
		],
	])("rechaza %s sin escribir", async (_case, design) => {
		const { service, calls } = createHarness();

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED },
		});
		expect(calls.saved).toEqual([]);
	});

	test("una imagen nueva que ya no está en storage no se guarda", async () => {
		const { service, calls } = createHarness({
			missing: [`documentos/certificados/${COURSE_DOC}/imagenes/a.png`],
		});

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: withImage(imageRef(COURSE_DOC)) },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_MISSING },
		});
		expect(calls.saved).toEqual([]);
	});

	// Lo ya guardado no se vuelve a mirar: borrarlo desde la nube lo quita
	// también del diseño.
	test("solo se comprueba lo que el diseño estrena", async () => {
		const saved = withImage(imageRef(COURSE_DOC));
		const { service, calls } = createHarness({
			record: recordOf({ draft: saved }),
		});

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: saved },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.existsChecked).toEqual([]);
	});

	test("un logo subido que existe se guarda", async () => {
		const { service, calls } = createHarness({ logos: [logoOf()] });

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: withLogo(LOGO_DOC) },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.saved).toHaveLength(1);
	});

	test("un logo que no existe no se guarda", async () => {
		const { service, calls } = createHarness({ logos: [] });

		expect(
			await service.saveDraft(
				{ documentId: COURSE_DOC, design: withLogo(LOGO_DOC) },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.LOGO_NOT_FOUND },
		});
		expect(calls.saved).toEqual([]);
	});

	test("un logo archivado no se elige, pero sigue si ya estaba", async () => {
		const archived = logoOf({ archivedAt: NOW });
		const fresh = createHarness({ logos: [archived] });
		expect(
			await fresh.service.saveDraft(
				{ documentId: COURSE_DOC, design: withLogo(LOGO_DOC) },
				actorOf(),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.LOGO_ARCHIVED } });

		const kept = createHarness({
			logos: [archived],
			record: recordOf({ published: withLogo(LOGO_DOC), exists: true }),
		});
		expect(
			(
				await kept.service.saveDraft(
					{ documentId: COURSE_DOC, design: withLogo(LOGO_DOC) },
					actorOf(),
				)
			).success,
		).toBe(true);
	});

	test("un curso cancelado no cambia de certificado", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "CANCELLED" }),
		});

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: DEFAULT_CERTIFICATE_DESIGN },
			actorOf(),
		);

		expect(result).toMatchObject({
			error: {
				code: CERTIFICATE_ERROR_CODES.NOT_EDITABLE,
				details: { status: "CANCELLED" },
			},
		});
		expect(calls.saved).toEqual([]);
	});

	test("un curso finalizado sí: la emisión ya congeló su diseño", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "FINISHED" }),
		});

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: DEFAULT_CERTIFICATE_DESIGN },
			actorOf(),
		);

		expect(result.success).toBe(true);
		expect(calls.saved).toHaveLength(1);
	});

	test("fuera de alcance no escribe", async () => {
		const { service, calls } = createHarness({ course: null });

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: DEFAULT_CERTIFICATE_DESIGN },
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.saved).toEqual([]);
	});
});

describe("certificateService.publish", () => {
	// Publica lo que está en pantalla, no lo último guardado.
	test("publica el diseño recibido con la hora del reloj", async () => {
		const onScreen = withText("En pantalla");
		const { service, calls } = createHarness({
			record: recordOf({ draft: withText("Guardado antes"), exists: true }),
		});

		const result = await service.publish(
			{ documentId: COURSE_DOC, design: onScreen },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.published).toEqual([
			{ courseId: 7, design: onScreen, at: NOW },
		]);
	});

	// Publicar recibe un diseño, así que pasa por la misma guarda que guardar:
	// sin ella se podría imprimir la firma de un titular ajeno.
	test("rechaza la imagen de otro curso sin publicar", async () => {
		const { service, calls } = createHarness();

		const result = await service.publish(
			{ documentId: COURSE_DOC, design: withImage(imageRef(OTHER_DOC)) },
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED },
		});
		expect(calls.published).toEqual([]);
	});

	test("una imagen que ya no está en storage no se publica", async () => {
		const { service, calls } = createHarness({
			missing: [`documentos/certificados/${COURSE_DOC}/imagenes/a.png`],
		});

		const result = await service.publish(
			{ documentId: COURSE_DOC, design: withImage(imageRef(COURSE_DOC)) },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ASSET_MISSING },
		});
		expect(calls.published).toEqual([]);
	});

	test("un curso cancelado no publica", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "CANCELLED" }),
		});

		expect(
			await service.publish(
				{ documentId: COURSE_DOC, design: DEFAULT_CERTIFICATE_DESIGN },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.NOT_EDITABLE },
		});
		expect(calls.published).toEqual([]);
	});
});

describe("certificateService.discardDraft", () => {
	test("el borrador vuelve a ser el publicado", async () => {
		const published = withText("Publicado");
		const { service, calls } = createHarness({
			record: recordOf({
				draft: withText("Cambiado"),
				published,
				exists: true,
			}),
		});

		const result = await service.discardDraft(COURSE_DOC, actorOf());

		expect(result).toMatchObject({ success: true });
		expect(calls.saved).toEqual([{ courseId: 7, design: published }]);
	});

	test("sin publicado no hay a qué volver", async () => {
		const { service, calls } = createHarness();

		expect(await service.discardDraft(COURSE_DOC, actorOf())).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.NEVER_PUBLISHED },
		});
		expect(calls.saved).toEqual([]);
	});
});

describe("certificateService.uploadImage", () => {
	test("sube al bucket privado, con la extensión del tipo real", async () => {
		const { service, calls } = createHarness();

		const result = await service.uploadImage(
			COURSE_DOC,
			fileOf(pngBytes(600, 200), { name: "logo.jpg", type: "image/jpeg" }),
			actorOf(),
		);

		expect(calls.uploaded).toHaveLength(1);
		const [upload] = calls.uploaded;
		expect(upload.key).toMatch(
			new RegExp(
				`^documentos/certificados/${COURSE_DOC}/imagenes/logo-[0-9a-f]{32}\\.png$`,
			),
		);
		expect(upload.bucket).toBe("privado");
		expect(upload.type).toBe("image/png");
		expect(result).toEqual(
			expect.objectContaining({
				success: true,
				data: { ref: toProxyRef(upload.key), widthPx: 600, heightPx: 200 },
			}),
		);
	});

	// Subir dos veces lo mismo no deja una copia huérfana: reescribe el objeto.
	test("la misma imagen subida dos veces cae en la misma key", async () => {
		const { service, calls } = createHarness();
		const upload = () =>
			service.uploadImage(
				COURSE_DOC,
				fileOf(pngBytes(600, 200), { name: "logo.png" }),
				actorOf(),
			);

		const [first, second] = [await upload(), await upload()];

		expect(calls.uploaded[0].key).toBe(calls.uploaded[1].key);
		expect(first.success && first.data).toEqual(second.success && second.data);
	});

	test("acepta un SVG de dibujo", async () => {
		const { service, calls } = createHarness();
		const svg = text(
			'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>',
		);

		const result = await service.uploadImage(
			COURSE_DOC,
			fileOf(svg, { name: "sello.svg", type: "image/svg+xml" }),
			actorOf(),
		);

		expect(result).toMatchObject({
			success: true,
			data: { widthPx: 40, heightPx: 20 },
		});
		expect(calls.uploaded[0].key).toMatch(/\.svg$/);
		expect(calls.uploaded[0].type).toBe("image/svg+xml");
	});

	test.each([
		["un archivo vacío", new Uint8Array(0), "el archivo está vacío"],
		[
			"algo que no es imagen",
			text("GIF89a......"),
			"no es una imagen de un formato admitido",
		],
		[
			"un SVG con scripts",
			text("<svg><script>alert(1)</script></svg>"),
			"el SVG contiene scripts",
		],
		[
			"una imagen de más de 2 MB",
			new Uint8Array(3 * 1024 * 1024),
			"pesa más de 2 MB",
		],
		["una imagen sin medidas", pngBytes(0, 0), "no tiene medidas"],
	])("rechaza %s sin subir", async (_case, bytes, reason) => {
		const { service, calls } = createHarness();

		const result = await service.uploadImage(
			COURSE_DOC,
			fileOf(bytes),
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: {
				code: CERTIFICATE_ERROR_CODES.ASSET_INVALID,
				details: { reason },
			},
		});
		expect(calls.uploaded).toEqual([]);
	});

	test("fuera de alcance no sube nada", async () => {
		const { service, calls } = createHarness({ course: null });

		expect(
			await service.uploadImage(
				COURSE_DOC,
				fileOf(pngBytes(10, 10)),
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.uploaded).toEqual([]);
	});

	test("sin bucket configurado es un error inesperado", async () => {
		const { service } = createHarness({ bucket: null });

		expect(
			await service.uploadImage(
				COURSE_DOC,
				fileOf(pngBytes(10, 10)),
				actorOf(),
			),
		).toMatchObject({ success: false, error: { code: "UNEXPECTED_ERROR" } });
	});
});

describe("certificateService.uploadBackground", () => {
	const pdf = () =>
		fileOf(text("%PDF-1.7"), { name: "diseño.pdf", type: "application/pdf" });

	test("guarda el PDF reconstruido y su raster en la carpeta de fondos", async () => {
		const { service, calls } = createHarness();

		const result = await service.uploadBackground(
			{
				documentId: COURSE_DOC,
				pdf: pdf(),
				raster: fileOf(pngBytes(3508, 2480)),
				rasterDpi: 300,
			},
			actorOf(),
		);

		expect(result).toMatchObject({
			success: true,
			data: { rasterDpi: 300, widthPt: 841.89, heightPt: 595.28 },
		});
		expect(calls.uploaded.map((upload) => upload.key)).toEqual([
			expect.stringMatching(
				new RegExp(
					`^documentos/certificados/${COURSE_DOC}/fondos/fondo-[0-9a-f]{32}\\.pdf$`,
				),
			),
			expect.stringMatching(/fondos\/fondo-[0-9a-f]{32}\.png$/),
		]);
		expect(calls.uploaded.every((upload) => upload.bucket === "privado")).toBe(
			true,
		);
	});

	test("un raster que no corresponde a la página se rechaza", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.uploadBackground(
				{
					documentId: COURSE_DOC,
					pdf: pdf(),
					raster: fileOf(pngBytes(1000, 700)),
					rasterDpi: 300,
				},
				actorOf(),
			),
		).toMatchObject({
			error: {
				code: CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID,
				details: { reason: "raster_mismatch" },
			},
		});
		expect(calls.uploaded).toEqual([]);
	});

	test("un PDF de más de 10 MB se rechaza sin leerlo", async () => {
		const { service } = createHarness();

		expect(
			await service.uploadBackground(
				{
					documentId: COURSE_DOC,
					pdf: { ...pdf(), size: 11 * 1024 * 1024 },
					raster: fileOf(pngBytes(3508, 2480)),
					rasterDpi: 300,
				},
				actorOf(),
			),
		).toMatchObject({ error: { details: { reason: "too_large" } } });
	});

	test("lo que rechaza el saneado llega con su motivo", async () => {
		const { service, calls } = createHarness({
			sanitizeError: new CertificateBackgroundInvalidError("encrypted"),
		});

		expect(
			await service.uploadBackground(
				{
					documentId: COURSE_DOC,
					pdf: pdf(),
					raster: fileOf(pngBytes(3508, 2480)),
					rasterDpi: 300,
				},
				actorOf(),
			),
		).toMatchObject({ error: { details: { reason: "encrypted" } } });
		expect(calls.uploaded).toEqual([]);
	});

	test("un curso cancelado no cambia de fondo", async () => {
		const { service } = createHarness({
			course: courseOf({ status: "CANCELLED" }),
		});

		expect(
			await service.uploadBackground(
				{
					documentId: COURSE_DOC,
					pdf: pdf(),
					raster: fileOf(pngBytes(3508, 2480)),
					rasterDpi: 300,
				},
				actorOf(),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.NOT_EDITABLE } });
	});
});

describe("exportación de un diseño v2", () => {
	test("pide solo lo que imprime y exporta al tamaño de su página", async () => {
		const { service, calls } = createHarness({
			record: recordOf({ draft: withLogo(LOGO_DOC), exists: true }),
			logos: [logoOf()],
		});

		await service.downloadSample(
			{ documentId: COURSE_DOC, version: "draft", format: "png" },
			actorOf(),
		);

		const [{ manifest, logos }] = calls.assets;
		expect(manifest.legacy).toBe(false);
		expect(manifest.logoIds).toEqual(["ayto-blanco", LOGO_DOC]);
		expect(logos).toEqual({
			"ayto-blanco": { kind: "builtin", path: "/assets/aytoBco.png" },
			[LOGO_DOC]: { kind: "storage", key: "media/logos/color-1.png" },
		});
		expect(calls.exported[0].profile.viewport.deviceScaleFactor).toBe(300 / 96);
		expect(calls.exported[0].html).toContain('src="data:logo"');
	});

	test("con PDF de fondo, el PDF se compone sobre el original vectorial", async () => {
		const design = {
			...DEFAULT_CERTIFICATE_DESIGN,
			background: PDF_BACKGROUND,
		} as CertificateDesignV2;
		const { service, calls } = createHarness({
			record: recordOf({ draft: design, exists: true }),
		});

		const result = await service.downloadSample(
			{ documentId: COURSE_DOC, version: "draft", format: "pdf" },
			actorOf(),
		);

		expect(calls.backgrounds).toEqual([PDF_BACKGROUND.pdfRef]);
		expect(calls.overlays).toBe(1);
		expect(calls.exported[0].profile.transparent).toBe(true);
		expect(calls.exported[0].html).not.toContain('class="bg"');
		expect(result).toMatchObject({
			success: true,
			data: { file: new Uint8Array([9, 9]) },
		});
	});

	test("con PDF de fondo, el PNG usa su raster", async () => {
		const design = {
			...DEFAULT_CERTIFICATE_DESIGN,
			background: PDF_BACKGROUND,
		} as CertificateDesignV2;
		const { service, calls } = createHarness({
			record: recordOf({ draft: design, exists: true }),
		});

		await service.downloadSample(
			{ documentId: COURSE_DOC, version: "draft", format: "png" },
			actorOf(),
		);

		expect(calls.backgrounds).toEqual([]);
		expect(calls.overlays).toBe(0);
		expect(calls.exported[0].html).toContain(
			'class="bg" src="data:image/png;base64,RklSTUE="',
		);
	});
});

describe("certificateService.downloadIssue", () => {
	test("dibuja SOLO lo congelado en la emisión, con los recursos incrustados", async () => {
		const { service, calls } = createHarness();

		const result = await service.downloadIssue(
			{ documentId: ISSUE_DOC, format: "pdf" },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				contentType: "application/pdf",
				fileName: "certificado-2026-0042.pdf",
			},
		});
		const [{ html, format }] = calls.exported;
		expect(format).toBe("pdf");
		expect(html).toContain("Ana Ruiz");
		expect(html).toContain("2026-0042");
		expect(html).toContain("data:image/png;base64,RklSTUE=");
		expect(html).not.toContain("/api/storage");
		expect(html).toContain('<div class="qr"><svg');
		expect(calls.assets[0].manifest).toEqual({
			legacy: true,
			faces: [],
			logoIds: [],
			imageRefs: [toProxyRef(`documentos/firmas/${COURSE_DOC}/firma-1.png`)],
		});
		// El v1 exporta como siempre: 1100×780 al doble.
		expect(calls.exported[0].profile.viewport).toEqual({
			width: 1100,
			height: 780,
			deviceScaleFactor: 2,
		});
	});

	test("busca con el alcance de impartición de quien descarga", async () => {
		const { service, calls } = createHarness();

		await service.downloadIssue(
			{ documentId: ISSUE_DOC, format: "png" },
			actorOf({ role: "USER", isTrainer: true, dependencyId: null }),
		);

		expect(calls.findIssue[0].where).toEqual({
			OR: [{ trainers: { some: { userId: 99 } } }],
		});
	});

	test("una emisión fuera de alcance responde como inexistente", async () => {
		const { service, calls } = createHarness({ issue: null });

		expect(
			await service.downloadIssue(
				{ documentId: ISSUE_DOC, format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND },
		});
		expect(calls.exported).toEqual([]);
	});

	test("una emisión revocada no se descarga", async () => {
		const { service, calls } = createHarness({
			issue: issueOf({ revokedAt: NOW }),
		});

		expect(
			await service.downloadIssue(
				{ documentId: ISSUE_DOC, format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.ISSUE_REVOKED },
		});
		expect(calls.exported).toEqual([]);
	});

	test("sin Chromium configurado responde que no está disponible", async () => {
		const { service } = createHarness({ exporterUnavailable: true });

		expect(
			await service.downloadIssue(
				{ documentId: ISSUE_DOC, format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.EXPORT_UNAVAILABLE },
		});
	});
});

describe("certificateService.downloadSample", () => {
	const published = withText("Versión publicada");
	const draft = withText("Versión en borrador");

	test.each([
		["draft", "Versión en borrador"],
		["published", "Versión publicada"],
	] as const)(
		"la versión %s sale del diseño guardado",
		async (version, expected) => {
			const { service, calls } = createHarness({
				record: recordOf({ draft, published, exists: true }),
			});

			const result = await service.downloadSample(
				{ documentId: COURSE_DOC, version, format: "png" },
				actorOf(),
			);

			expect(result).toMatchObject({
				success: true,
				data: { contentType: "image/png" },
			});
			expect(calls.exported[0].html).toContain(expected);
			expect(calls.exported[0].html).toContain("Nombre del participante");
		},
	);

	test("la publicada de un certificado que nunca se publicó no existe", async () => {
		const { service } = createHarness();

		expect(
			await service.downloadSample(
				{ documentId: COURSE_DOC, version: "published", format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.NEVER_PUBLISHED },
		});
	});

	test("un curso fuera de alcance responde como inexistente", async () => {
		const { service, calls } = createHarness({ course: null });

		expect(
			await service.downloadSample(
				{ documentId: COURSE_DOC, version: "draft", format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.exported).toEqual([]);
	});
});

describe("certificateService.verify", () => {
	test("un válido responde solo lo impreso", async () => {
		const { service } = createHarness();

		const result = await service.verify(ISSUE_DOC);

		expect(result).toMatchObject({
			success: true,
			data: {
				status: "valid",
				folio: "2026-0042",
				recipientName: "Ana Ruiz",
				courseTitle: "Seguridad en obra",
			},
		});
		expect(JSON.stringify(result)).not.toMatch(/@|userId|courseId/);
	});

	test("un revocado responde no válido, sin datos de la persona", async () => {
		const { service } = createHarness({
			verifiable: { folio: "2026-0042", revokedAt: NOW, data: issueOf().data },
		});

		expect(await service.verify(ISSUE_DOC)).toMatchObject({
			success: true,
			data: { status: "revoked", folio: "2026-0042" },
		});
	});

	test("uno inexistente responde ISSUE_NOT_FOUND", async () => {
		const { service } = createHarness({ verifiable: null });

		expect(await service.verify(ISSUE_DOC)).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND },
		});
	});
});

describe("certificateService.saveDelivery", () => {
	test("guarda la descarga y el mensaje; un mensaje vacío queda nulo", async () => {
		const { service, calls } = createHarness();

		const result = await service.saveDelivery(
			{ documentId: COURSE_DOC, isDownloadable: false, emailMessage: "" },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.deliveries).toEqual([
			{ courseId: 7, delivery: { isDownloadable: false, emailMessage: null } },
		]);
	});

	test("fuera de alcance responde como inexistente", async () => {
		const { service, calls } = createHarness({ course: null });

		expect(
			await service.saveDelivery(
				{ documentId: COURSE_DOC, isDownloadable: true, emailMessage: null },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.deliveries).toEqual([]);
	});

	test("un curso cancelado ya no cambia su entrega", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "CANCELLED" }),
		});

		expect(
			await service.saveDelivery(
				{ documentId: COURSE_DOC, isDownloadable: true, emailMessage: null },
				actorOf(),
			),
		).toMatchObject({ error: { code: CERTIFICATE_ERROR_CODES.NOT_EDITABLE } });
		expect(calls.deliveries).toEqual([]);
	});
});

describe("certificateService.listMine", () => {
	test("pide solo los de quien está en sesión y los proyecta", async () => {
		const { service, calls } = createHarness();

		const result = await service.listMine(actorOf({ userId: 42 }));

		expect(calls.mineFor).toEqual([42]);
		expect(result).toMatchObject({
			success: true,
			data: [
				{
					documentId: ISSUE_DOC,
					folio: "2026-0042",
					courseTitle: "Seguridad en obra",
					downloadable: true,
					verificationPath: `/verificar/${ISSUE_DOC}`,
				},
			],
		});
		expect(calls.mineTake).toEqual([undefined]);
	});

	test("con límite, pide solo los más recientes", async () => {
		const { service, calls } = createHarness();

		await service.listMine(actorOf({ userId: 42 }), { limit: 3 });

		expect(calls.mineTake).toEqual([3]);
	});
});

describe("certificateService.downloadMine", () => {
	test("dibuja lo congelado de la propia emisión, con su QR", async () => {
		const { service, calls } = createHarness();

		const result = await service.downloadMine(
			{ documentId: ISSUE_DOC, format: "png" },
			actorOf({ userId: 42 }),
		);

		expect(result).toMatchObject({
			success: true,
			data: { contentType: "image/png" },
		});
		expect(calls.myIssueFor).toEqual([{ documentId: ISSUE_DOC, userId: 42 }]);
		expect(calls.exported[0].html).toContain('<div class="qr"><svg');
	});

	test("ajena, revocada o inexistente responde como inexistente", async () => {
		const { service, calls } = createHarness({ mine: null });

		expect(
			await service.downloadMine(
				{ documentId: ISSUE_DOC, format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND },
		});
		expect(calls.exported).toEqual([]);
	});

	test("con la descarga apagada no se genera el archivo", async () => {
		const { service, calls } = createHarness({
			mine: {
				documentId: ISSUE_DOC,
				design: issueOf().design,
				data: issueOf().data,
				downloadable: false,
			},
		});

		expect(
			await service.downloadMine(
				{ documentId: ISSUE_DOC, format: "pdf" },
				actorOf(),
			),
		).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.DOWNLOAD_DISABLED },
		});
		expect(calls.exported).toEqual([]);
	});
});
