import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../domain/certificate.config";
import type { CertificateDesign } from "../../domain/certificate.types";
import { createCertificateRepository } from "../certificates.repository.server";

const REF_A = "/api/storage?key=documentos%2Ffirmas%2Fc%2Fa.png";
const REF_B = "/api/storage?key=documentos%2Ffirmas%2Fc%2Fb.png";

const withRefs = (first: string | null, second: string | null) =>
	({
		...DEFAULT_CERTIFICATE_DESIGN,
		signatories: [
			{ ...DEFAULT_CERTIFICATE_DESIGN.signatories[0], signatureUrl: first },
			{ ...DEFAULT_CERTIFICATE_DESIGN.signatories[1], signatureUrl: second },
		],
	}) satisfies CertificateDesign;

const createHarness = (
	row: unknown = null,
	options: { counter?: number; issue?: unknown } = {},
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
			createMany: async (args: unknown) => {
				writes.push({ createMany: args });
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
		const published = { ...DEFAULT_CERTIFICATE_DESIGN, subtitle: "Publicado" };
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

	test("publicar escribe el publicado y su fecha, sin tocar el borrador", async () => {
		const { repository, writes } = createHarness();
		const at = new Date("2026-09-23T18:00:00.000Z");

		await repository.publish(7, DEFAULT_CERTIFICATE_DESIGN, at);

		expect(writes[0]).toMatchObject({
			upsert: {
				update: {
					publishedDesign: DEFAULT_CERTIFICATE_DESIGN,
					publishedAt: at,
				},
			},
		});
	});
});

describe("removeSignatureRefs", () => {
	test("quita la firma del borrador y del publicado en una escritura", async () => {
		const { repository, writes } = createHarness({
			courseId: 7,
			draftDesign: withRefs(REF_A, REF_B),
			publishedDesign: withRefs(REF_A, null),
			publishedAt: new Date(),
		});

		const removed = await repository.removeSignatureRefs("c", [REF_A]);

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

		expect(await repository.removeSignatureRefs("c", [REF_A])).toBe(0);
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

	test("un diseño congelado ilegible cae al de por defecto y se registra", async () => {
		const { repository, errors } = createHarness(null, {
			issue: rowOf({ designSnapshot: { templateId: "clasica" } }),
		});

		expect((await repository.findIssue("c", {}))?.design).toEqual(
			DEFAULT_CERTIFICATE_DESIGN,
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
	test("escribe cada emisión con sus dos snapshots", async () => {
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
						},
					],
				},
			},
		]);
	});
});
