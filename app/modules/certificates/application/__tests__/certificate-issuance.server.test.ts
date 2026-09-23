import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../domain/certificate.config";
import type {
	CertificateCourse,
	CertificateDesign,
	NewCertificateIssue,
	StoredIssue,
} from "../../domain/certificate.types";
import { createCertificateIssuance } from "../certificate-issuance.server";

const AT = new Date("2026-03-10T18:00:00.000Z");

const course: CertificateCourse = {
	id: 7,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	status: "FINISHED",
	title: "Seguridad en obra",
	description: null,
	dependencyName: "Secretaría de Obras Públicas",
	hours: 20,
};

const PUBLISHED: CertificateDesign = {
	...DEFAULT_CERTIFICATE_DESIGN,
	templateId: "marco",
	folioFormat: "SOP-{year}-{seq}",
};

const ana = { userId: 50, recipientName: "Ana Ruiz" };
const luis = { userId: 51, recipientName: "Luis Peña" };

/**
 * Doble en memoria: lo emitido en una llamada es lo que la siguiente encuentra,
 * que es lo que prueba la idempotencia.
 */
const createHarness = (
	options: {
		published?: CertificateDesign | null;
		stored?: StoredIssue[];
	} = {},
) => {
	let stored = [...(options.stored ?? [])];
	let counter = 41;
	const log = {
		created: [] as NewCertificateIssue[],
		restored: [] as number[][],
		revoked: [] as number[][],
	};

	const certificateRepository = {
		findIssuesByCourse: async () => stored.map((issue) => ({ ...issue })),
		findCourseById: async () => course,
		findRecord: async () => ({
			draft: DEFAULT_CERTIFICATE_DESIGN,
			published:
				options.published === undefined ? PUBLISHED : options.published,
			publishedAt: null,
			exists: true,
		}),
		reserveFolios: async (count: number) => {
			const first = counter + 1;
			counter += count;
			return first;
		},
		createIssues: async (_courseId: number, issues: NewCertificateIssue[]) => {
			log.created.push(...issues);
			stored = [
				...stored,
				...issues.map((issue) => ({ userId: issue.userId, revokedAt: null })),
			];
		},
		restoreIssues: async (_courseId: number, userIds: number[]) => {
			if (userIds.length > 0) log.restored.push([...userIds]);
			stored = stored.map((issue) =>
				userIds.includes(issue.userId) ? { ...issue, revokedAt: null } : issue,
			);
		},
		revokeIssues: async (_courseId: number, userIds: number[], at: Date) => {
			if (userIds.length > 0) log.revoked.push([...userIds]);
			stored = stored.map((issue) =>
				userIds.includes(issue.userId) ? { ...issue, revokedAt: at } : issue,
			);
		},
	} as unknown as ICradle["certificateRepository"];

	return {
		issuance: createCertificateIssuance({ certificateRepository }),
		log,
	};
};

describe("certificateIssuance.sync", () => {
	test("emite con el diseño publicado y folios consecutivos", async () => {
		const { issuance, log } = createHarness();

		const result = await issuance.sync(7, [ana, luis], AT);

		expect(result).toEqual({ issued: 2, restored: 0, revoked: 0 });
		expect(log.created.map((issue) => issue.folio)).toEqual([
			"SOP-2026-0042",
			"SOP-2026-0043",
		]);
		expect(log.created[0]).toMatchObject({
			userId: 50,
			design: PUBLISHED,
			data: {
				recipientName: "Ana Ruiz",
				courseTitle: "Seguridad en obra",
				hours: "20 horas",
				issuedOn: "10 de marzo de 2026",
				folio: "SOP-2026-0042",
			},
		});
	});

	test("sin diseño publicado emite con el de por defecto", async () => {
		const { issuance, log } = createHarness({ published: null });

		await issuance.sync(7, [ana], AT);

		expect(log.created[0]).toMatchObject({
			design: DEFAULT_CERTIFICATE_DESIGN,
			folio: "2026-0042",
		});
	});

	test("sincronizar dos veces no duplica folios", async () => {
		const { issuance, log } = createHarness();

		await issuance.sync(7, [ana], AT);
		const again = await issuance.sync(7, [ana], AT);

		expect(again).toEqual({ issued: 0, restored: 0, revoked: 0 });
		expect(log.created).toHaveLength(1);
	});

	test("revoca a quien deja de completar y lo restaura con el mismo folio", async () => {
		const { issuance, log } = createHarness();

		await issuance.sync(7, [ana], AT);
		await issuance.sync(7, [], AT);
		const restored = await issuance.sync(7, [ana], AT);

		expect(log.revoked).toEqual([[50]]);
		expect(log.restored).toEqual([[50]]);
		expect(restored.issued).toBe(0);
		expect(log.created).toHaveLength(1);
	});

	test("sin nadie a quien emitir no reserva folios ni lee el diseño", async () => {
		const { issuance, log } = createHarness({
			stored: [{ userId: 50, revokedAt: null }],
		});

		expect(await issuance.sync(7, [ana], AT)).toEqual({
			issued: 0,
			restored: 0,
			revoked: 0,
		});
		expect(log.created).toEqual([]);
	});
});
