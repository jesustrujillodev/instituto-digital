import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { CertificateDesign } from "../../domain/certificate.types";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../domain/design/design.presets";
import { LEGACY_DEFAULT_DESIGN_V1 } from "../../domain/design/design-v1.schema";
import { createCertificateRepository } from "../certificates.repository.server";

const REF_A = "/api/storage?key=documentos%2Ffirmas%2Fc%2Fa.png";
const REF_B = "/api/storage?key=documentos%2Ffirmas%2Fc%2Fb.png";

const withRefs = (first: string | null, second: string | null) =>
	({
		...LEGACY_DEFAULT_DESIGN_V1,
		signatories: [
			{ ...LEGACY_DEFAULT_DESIGN_V1.signatories[0], signatureUrl: first },
			{ ...LEGACY_DEFAULT_DESIGN_V1.signatories[1], signatureUrl: second },
		],
	}) satisfies CertificateDesign;

const createHarness = (
	row: unknown = null,
	options: { counter?: number; issue?: unknown; issues?: unknown[] } = {},
) => {
	const errors: unknown[] = [];
	const writes: unknown[] = [];

	const logger: Logger = {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: (...args: unknown[]) => {
			errors.push(args);
		},
		child: () => logger,
	};

	const prisma = {
		courseCertificate: {
			findUnique: async () => row,
			findFirst: async () => row,
			findMany: async () => (row ? [row] : []),
			upsert: async (args: unknown) => {
				writes.push({ upsert: args });
			},
			update: async (args: unknown) => {
				writes.push({ update: args });
			},
		},
		certificateFolioCounter: {
			upsert: async (args: { update: { value: { increment: number } } }) => {
				writes.push({ counter: args });
				return {
					value: (options.counter ?? 0) + args.update.value.increment,
				};
			},
		},
		certificateIssue: {
			findFirst: async (args: unknown) => {
				writes.push({ findIssue: args });
				return options.issue ?? null;
			},
			findUnique: async (args: unknown) => {
				writes.push({ findForVerification: args });
				return options.issue ?? null;
			},
			createMany: async (args: unknown) => {
				writes.push({ createMany: args });
			},
			findMany: async (args: unknown) => {
				writes.push({ findMany: args });
				return options.issues ?? [];
			},
		},
	} as unknown as ICradle["prisma"];

	return {
		repository: createCertificateRepository({ prisma, logger }),
		errors,
		writes,
	};
};

describe("findRecord", () => {
	test("sin fila, el diseño por defecto y sin publicar", async () => {
		const { repository } = createHarness(null);

		expect(await repository.findRecord(7)).toEqual({
			draft: DEFAULT_CERTIFICATE_DESIGN,
			published: null,
			publishedAt: null,
			exists: false,
		});
	});

	test("un blob roto cae al diseño por defecto y se registra", async () => {
		const { repository, errors } = createHarness({
			draftDesign: { templateId: "clasica" },
			publishedDesign: null,
			publishedAt: null,
		});

		const record = await repository.findRecord(7);

		expect(record).toMatchObject({
			draft: DEFAULT_CERTIFICATE_DESIGN,
			published: null,
			exists: true,
		});
		expect(errors).toHaveLength(1);
	});

	test("un publicado legible se lee tal cual", async () => {
		const published = { ...LEGACY_DEFAULT_DESIGN_V1, subtitle: "Publicado" };
		const at = new Date("2026-09-01T00:00:00.000Z");
		const { repository, errors } = createHarness({
			draftDesign: DEFAULT_CERTIFICATE_DESIGN,
			publishedDesign: published,
			publishedAt: at,
		});

		expect(await repository.findRecord(7)).toMatchObject({
			published,
			publishedAt: at,
		});
		expect(errors).toEqual([]);
	});
});

describe("findRecordWithDelivery", () => {
	test("sin fila, lo mismo que findRecord y findDelivery por separado", async () => {
		const { repository } = createHarness(null);

		expect(await repository.findRecordWithDelivery(7)).toEqual({
			record: await repository.findRecord(7),
			delivery: await repository.findDelivery(7),
		});
	});

	test("con fila, el diseño y la entrega de esa misma fila", async () => {
		const row = {
			draftDesign: DEFAULT_CERTIFICATE_DESIGN,
			publishedDesign: null,
			publishedAt: null,
			isDownloadable: false,
			emailMessage: "Felicidades",
		};
		const { repository } = createHarness(row);

		expect(await repository.findRecordWithDelivery(7)).toEqual({
			record: await repository.findRecord(7),
			delivery: { isDownloadable: false, emailMessage: "Felicidades" },
		});
	});
});

describe("saveDraft y publish", () => {
	test("guardar crea la fila la primera vez y después solo toca el borrador", async () => {
		const { repository, writes } = createHarness();

		await repository.saveDraft(7, DEFAULT_CERTIFICATE_DESIGN);

		expect(writes).toEqual([
			{
				upsert: {
					where: { courseId: 7 },
					create: { courseId: 7, draftDesign: DEFAULT_CERTIFICATE_DESIGN },
					update: { draftDesign: DEFAULT_CERTIFICATE_DESIGN },
				},
			},
		]);
	});

	// Tras publicar, borrador y publicado coinciden: el editor dice "Publicado"
	// y no "Cambios sin publicar".
	test("publicar escribe el diseño como borrador y como publicado, con su fecha", async () => {
		const { repository, writes } = createHarness();
		const at = new Date("2026-09-23T18:00:00.000Z");

		await repository.publish(7, DEFAULT_CERTIFICATE_DESIGN, at);

		expect(writes[0]).toMatchObject({
			upsert: {
				update: {
					draftDesign: DEFAULT_CERTIFICATE_DESIGN,
					publishedDesign: DEFAULT_CERTIFICATE_DESIGN,
					publishedAt: at,
				},
			},
		});
	});
});

describe("findByCourseDocumentIds", () => {
	const course = {
		documentId: "c",
		title: "Seguridad en obra",
		certificateIssues: [{ assetRefs: [REF_A] }, { assetRefs: [REF_A] }],
	};

	test("lo que nombran el borrador y el publicado, y lo emitido", async () => {
		const { repository } = createHarness({
			draftDesign: withRefs(REF_A, null),
			publishedDesign: withRefs(null, REF_B),
			course,
		});

		expect(await repository.findByCourseDocumentIds(["c"])).toEqual([
			{
				courseDocumentId: "c",
				courseTitle: "Seguridad en obra",
				designRefs: [REF_A, REF_B],
				unreadableRefs: [],
				issuedAssetRefs: [REF_A],
			},
		]);
	});

	test("de un borrador ilegible se rescatan sus referencias", async () => {
		const { repository } = createHarness({
			draftDesign: { templateId: "clasica", firma: REF_B },
			publishedDesign: null,
			course,
		});

		expect(await repository.findByCourseDocumentIds(["c"])).toEqual([
			expect.objectContaining({
				designRefs: [REF_B],
				unreadableRefs: [REF_B],
			}),
		]);
	});
});

describe("removeAssetRefs", () => {
	test("quita la firma del borrador y del publicado en una escritura", async () => {
		const { repository, writes } = createHarness({
			courseId: 7,
			draftDesign: withRefs(REF_A, REF_B),
			publishedDesign: withRefs(REF_A, null),
			publishedAt: new Date(),
		});

		const removed = await repository.removeAssetRefs("c", [REF_A]);

		expect(removed).toBe(2);
		expect(writes).toEqual([
			{
				update: {
					where: { courseId: 7 },
					data: {
						draftDesign: withRefs(null, REF_B),
						publishedDesign: withRefs(null, null),
					},
				},
			},
		]);
	});

	test("si ninguna firma coincide no escribe", async () => {
		const { repository, writes } = createHarness({
			courseId: 7,
			draftDesign: withRefs(REF_B, null),
			publishedDesign: null,
			publishedAt: null,
		});

		expect(await repository.removeAssetRefs("c", [REF_A])).toBe(0);
		expect(writes).toEqual([]);
	});
});

describe("reserveFolios", () => {
	test("devuelve el primero de los consecutivos reservados", async () => {
		const { repository } = createHarness(null, { counter: 41 });

		expect(await repository.reserveFolios(3)).toBe(42);
	});

	test("el primer folio de la plataforma es el 1", async () => {
		const { repository, writes } = createHarness(null);

		expect(await repository.reserveFolios(2)).toBe(1);
		expect(writes[0]).toMatchObject({
			counter: {
				where: { id: "folio" },
				create: { id: "folio", value: 2 },
			},
		});
	});
});

describe("findIssue", () => {
	const data = {
		recipientName: "Ana Ruiz",
		courseTitle: "Seguridad en obra",
		courseDescription: "",
		dependencyName: "Obras Públicas",
		hours: "20 horas",
		issuedOn: "10 de marzo de 2026",
		folio: "2026-0001",
	};
	const rowOf = (overrides: Record<string, unknown> = {}) => ({
		documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		courseId: 7,
		folio: "2026-0001",
		revokedAt: null,
		designSnapshot: withRefs(REF_A, null),
		dataSnapshot: data,
		...overrides,
	});

	test("filtra por el alcance sobre el curso y lee lo congelado", async () => {
		const where = { OR: [{ dependencyId: 3 }] };
		const { repository, writes } = createHarness(null, { issue: rowOf() });

		const issue = await repository.findIssue("c", where);

		expect(issue).toMatchObject({
			folio: "2026-0001",
			design: withRefs(REF_A, null),
			data,
		});
		expect(writes[0]).toMatchObject({
			findIssue: { where: { documentId: "c", course: where } },
		});
	});

	// Cae al v1 congelado, no al diseño por defecto del editor: si este cambia,
	// un snapshot ilegible no puede cambiar de aspecto con él.
	test("un diseño congelado ilegible cae al v1 de reserva y se registra", async () => {
		const { repository, errors } = createHarness(null, {
			issue: rowOf({ designSnapshot: { templateId: "clasica" } }),
		});

		expect((await repository.findIssue("c", {}))?.design).toEqual(
			LEGACY_DEFAULT_DESIGN_V1,
		);
		expect(errors).toHaveLength(1);
	});

	// Sin los datos no se sabe a quién se otorgó: no hay sustituto posible.
	test("unos datos ilegibles lanzan en vez de inventar un certificado", async () => {
		const { repository } = createHarness(null, {
			issue: rowOf({ dataSnapshot: { folio: "x" } }),
		});

		await expect(repository.findIssue("c", {})).rejects.toThrow();
	});
});

describe("createIssues", () => {
	test("escribe cada emisión con sus dos snapshots y lo que imprime", async () => {
		const { repository, writes } = createHarness();
		const at = new Date("2026-03-10T18:00:00.000Z");
		const design = withRefs(null, null);

		await repository.createIssues(
			7,
			[
				{
					userId: 50,
					folio: "2026-0001",
					design,
					data: { folio: "2026-0001" } as never,
				},
			],
			at,
		);

		expect(writes).toEqual([
			{
				createMany: {
					data: [
						{
							courseId: 7,
							userId: 50,
							folio: "2026-0001",
							issuedAt: at,
							designSnapshot: design,
							dataSnapshot: { folio: "2026-0001" },
							assetRefs: [],
						},
					],
				},
			},
		]);
	});
});

describe("findIssueForVerification", () => {
	test("sin alcance, lee solo folio, revocación y datos", async () => {
		const data = {
			recipientName: "Ana Ruiz",
			courseTitle: "Seguridad en obra",
			courseDescription: "",
			dependencyName: "Obras Públicas",
			hours: null,
			issuedOn: "10 de marzo de 2026",
			folio: "2026-0001",
		};
		const { repository, writes } = createHarness(null, {
			issue: { folio: "2026-0001", revokedAt: null, dataSnapshot: data },
		});

		expect(await repository.findIssueForVerification("c")).toEqual({
			folio: "2026-0001",
			revokedAt: null,
			data,
		});
		expect(writes[0]).toEqual({
			findForVerification: {
				where: { documentId: "c" },
				select: { folio: true, revokedAt: true, dataSnapshot: true },
			},
		});
	});

	test("inexistente devuelve null", async () => {
		const { repository } = createHarness(null);

		expect(await repository.findIssueForVerification("c")).toBeNull();
	});
});

describe("entrega al participante", () => {
	const data = {
		recipientName: "Ana Ruiz",
		courseTitle: "Seguridad en obra",
		courseDescription: "",
		dependencyName: "Obras Públicas",
		hours: "20 horas",
		issuedOn: "10 de marzo de 2026",
		folio: "2026-0001",
	};

	test("findMine pide solo las vigentes de esa persona", async () => {
		const { repository, writes } = createHarness(null, {
			issues: [
				{
					documentId: "c",
					dataSnapshot: data,
					course: { certificate: { isDownloadable: false } },
				},
				{
					documentId: "d",
					dataSnapshot: { roto: true },
					course: { certificate: null },
				},
			],
		});

		const mine = await repository.findMine(42);

		expect(writes[0]).toMatchObject({
			findMany: { where: { userId: 42, revokedAt: null } },
		});
		// La fila ilegible se omite en vez de inventar un certificado.
		expect(mine).toEqual([{ documentId: "c", data, downloadable: false }]);
	});

	test("findMine con tope lo pasa como take", async () => {
		const { repository, writes } = createHarness(null, { issues: [] });

		await repository.findMine(42, 3);

		expect(writes[0]).toMatchObject({
			findMany: { orderBy: { issuedAt: "desc" }, take: 3 },
		});
	});

	test("findMyIssue exige que sea de esa persona y vigente", async () => {
		const { repository, writes } = createHarness(null, {
			issue: {
				documentId: "c",
				courseId: 7,
				designSnapshot: withRefs(null, null),
				dataSnapshot: data,
				course: { certificate: null },
			},
		});

		const issue = await repository.findMyIssue("c", 42);

		expect(writes[0]).toMatchObject({
			findIssue: { where: { documentId: "c", userId: 42, revokedAt: null } },
		});
		// Sin fila de certificado, la descarga está permitida.
		expect(issue).toMatchObject({ documentId: "c", downloadable: true });
	});

	test("sin fila, la entrega por defecto permite descargar y no lleva mensaje", async () => {
		const { repository } = createHarness(null);

		expect(await repository.findDelivery(7)).toEqual({
			isDownloadable: true,
			emailMessage: null,
		});
	});

	test("saveDelivery crea la fila si hace falta, con el diseño por defecto", async () => {
		const { repository, writes } = createHarness();

		await repository.saveDelivery(7, {
			isDownloadable: false,
			emailMessage: "Hola",
		});

		expect(writes).toEqual([
			{
				upsert: {
					where: { courseId: 7 },
					create: {
						courseId: 7,
						draftDesign: DEFAULT_CERTIFICATE_DESIGN,
						isDownloadable: false,
						emailMessage: "Hola",
					},
					update: { isDownloadable: false, emailMessage: "Hola" },
				},
			},
		]);
	});
});
