import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { toProxyRef } from "@/shared/storage/public-url";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../domain/certificate.config";
import {
	CERTIFICATE_ERROR_CODES,
	CertificateExportUnavailableError,
} from "../../domain/certificate.errors";
import type {
	CertificateCourse,
	CertificateDelivery,
	CertificateDesign,
	CertificateExportFormat,
	CertificateIssueRecord,
	CertificateRecord,
	MyIssueRecord,
	VerifiableIssue,
} from "../../domain/certificate.types";
import { createCertificateService } from "../certificates.service.server";

const COURSE_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_DOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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

const withSignature = (ref: string | null): CertificateDesign => ({
	...DEFAULT_CERTIFICATE_DESIGN,
	signatories: [
		{ ...DEFAULT_CERTIFICATE_DESIGN.signatories[0], signatureUrl: ref },
		DEFAULT_CERTIFICATE_DESIGN.signatories[1],
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
	design: withSignature(
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

const fileOf = (overrides: Partial<{ type: string; size: number }> = {}) => ({
	name: "firma.png",
	type: "image/png",
	size: 2048,
	arrayBuffer: async () => new ArrayBuffer(8),
	...overrides,
});

const createHarness = (
	options: {
		course?: CertificateCourse | null;
		record?: CertificateRecord;
		bucket?: string | null;
		issue?: CertificateIssueRecord | null;
		verifiable?: VerifiableIssue | null;
		mine?: MyIssueRecord | null;
		exporterUnavailable?: boolean;
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
		findIssue: [] as { documentId: string; where: unknown }[],
		assets: [] as (readonly string[])[],
		exported: [] as { html: string; format: CertificateExportFormat }[],
		deliveries: [] as { courseId: number; delivery: CertificateDelivery }[],
		mineFor: [] as number[],
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
		findMine: async (userId: number) => {
			calls.mineFor.push(userId);
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

	const storageProvider = {
		uploadFile: async (
			bucket: string,
			key: string,
			_body: unknown,
			type?: string,
		) => {
			calls.uploaded.push({ bucket, key, type });
		},
	} as unknown as ICradle["storageProvider"];

	const certificateAssetSource = {
		load: async (refs: readonly string[]) => {
			calls.assets.push(refs);
			return {
				fonts: {
					XLt: "data:f",
					Bk: "data:f",
					Md: "data:f",
					Demi: "data:f",
					Bold: "data:f",
				},
				logo: "data:image/png;base64,TE9HTw==",
				signatures: Object.fromEntries(
					refs.map((ref) => [ref, "data:image/png;base64,RklSTUE="]),
				),
			};
		},
	} as unknown as ICradle["certificateAssetSource"];

	const certificateExporter = {
		export: async (html: string, format: CertificateExportFormat) => {
			if (options.exporterUnavailable) {
				throw new CertificateExportUnavailableError();
			}
			calls.exported.push({ html, format });
			return new Uint8Array([37, 80, 68, 70]);
		},
	} as unknown as ICradle["certificateExporter"];

	const service = createCertificateService({
		certificateRepository,
		certificateAssetSource,
		certificateExporter,
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
	const ownRef = toProxyRef(`documentos/firmas/${COURSE_DOC}/firma-1.png`);

	test("guarda el borrador con una firma propia", async () => {
		const { service, calls } = createHarness();
		const design = withSignature(ownRef);

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.saved).toEqual([{ courseId: 7, design }]);
	});

	test.each([
		["una vista previa local", "blob:https://app.test/1234"],
		[
			"una firma de otro curso",
			toProxyRef(`documentos/firmas/${OTHER_DOC}/a.png`),
		],
		["una URL externa", "https://cdn.test/firma.png"],
	])("rechaza %s sin escribir", async (_case, ref) => {
		const { service, calls } = createHarness();

		const result = await service.saveDraft(
			{ documentId: COURSE_DOC, design: withSignature(ref) },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.SIGNATURE_NOT_OWNED },
		});
		expect(calls.saved).toEqual([]);
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
	test("publica el borrador GUARDADO con la hora del reloj", async () => {
		const saved = { ...DEFAULT_CERTIFICATE_DESIGN, subtitle: "Guardado" };
		const { service, calls } = createHarness({
			record: recordOf({ draft: saved, exists: true }),
		});

		const result = await service.publish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.published).toEqual([{ courseId: 7, design: saved, at: NOW }]);
	});

	test("un curso cancelado no publica", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "CANCELLED" }),
		});

		expect(await service.publish(COURSE_DOC, actorOf())).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.NOT_EDITABLE },
		});
		expect(calls.published).toEqual([]);
	});
});

describe("certificateService.discardDraft", () => {
	test("el borrador vuelve a ser el publicado", async () => {
		const published = { ...DEFAULT_CERTIFICATE_DESIGN, subtitle: "Publicado" };
		const { service, calls } = createHarness({
			record: recordOf({
				draft: { ...published, subtitle: "Cambiado" },
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

describe("certificateService.uploadSignature", () => {
	test("sube bajo la carpeta del curso, al bucket privado", async () => {
		const { service, calls } = createHarness();

		const result = await service.uploadSignature(
			COURSE_DOC,
			fileOf(),
			actorOf(),
		);

		expect(calls.uploaded).toHaveLength(1);
		const [upload] = calls.uploaded;
		expect(upload.key).toMatch(
			new RegExp(`^documentos/firmas/${COURSE_DOC}/firma-\\d+\\.png$`),
		);
		// Fuera de `media/`: nunca el bucket público ni el CDN.
		expect(upload.bucket).toBe("privado");
		expect(upload.type).toBe("image/png");
		expect(result).toEqual(
			expect.objectContaining({
				success: true,
				data: { signatureUrl: toProxyRef(upload.key) },
			}),
		);
	});

	test.each([
		["un JPG, que pierde la transparencia", { type: "image/jpeg" }],
		["una imagen de más de 1 MB", { size: 2 * 1024 * 1024 }],
		["un archivo vacío", { size: 0 }],
	])("rechaza %s sin subir", async (_case, overrides) => {
		const { service, calls } = createHarness();

		const result = await service.uploadSignature(
			COURSE_DOC,
			fileOf(overrides),
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CERTIFICATE_ERROR_CODES.SIGNATURE_INVALID },
		});
		expect(calls.uploaded).toEqual([]);
	});

	test("fuera de alcance no sube nada", async () => {
		const { service, calls } = createHarness({ course: null });

		const result = await service.uploadSignature(
			COURSE_DOC,
			fileOf(),
			actorOf(),
		);

		expect(result).toMatchObject({
			error: { code: CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.uploaded).toEqual([]);
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
		expect(calls.assets).toEqual([
			[toProxyRef(`documentos/firmas/${COURSE_DOC}/firma-1.png`)],
		]);
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
	const published: CertificateDesign = {
		...DEFAULT_CERTIFICATE_DESIGN,
		subtitle: "Versión publicada",
	};
	const draft: CertificateDesign = {
		...DEFAULT_CERTIFICATE_DESIGN,
		subtitle: "Versión en borrador",
	};

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
