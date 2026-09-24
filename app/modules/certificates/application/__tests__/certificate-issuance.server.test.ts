import { describe, expect, test } from "vitest";
import type { NotificationEvent } from "@/modules/notifications/domain/notification.types";
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

const ana = {
	userId: 50,
	recipientName: "Ana Ruiz",
	email: "ana@instituto.gob.mx",
	firstName: "Ana",
	lastName: "Ruiz",
};
const luis = {
	userId: 51,
	recipientName: "Luis Peña",
	email: "luis@universidad.mx",
	firstName: "Luis",
	lastName: "Peña",
};

/**
 * Doble en memoria: lo emitido en una llamada es lo que la siguiente encuentra,
 * que es lo que prueba la idempotencia.
 */
const createHarness = (
	options: {
		published?: CertificateDesign | null;
		stored?: StoredIssue[];
		delivery?: { isDownloadable: boolean; emailMessage: string | null };
		failCreate?: boolean;
	} = {},
) => {
	let stored = [...(options.stored ?? [])];
	let counter = 41;
	const log = {
		created: [] as NewCertificateIssue[],
		restored: [] as number[][],
		revoked: [] as number[][],
		emails: [] as NotificationEvent[],
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
		findDelivery: async () =>
			options.delivery ?? { isDownloadable: true, emailMessage: null },
		createIssues: async (_courseId: number, issues: NewCertificateIssue[]) => {
			if (options.failCreate) throw new Error("unique violation");
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

	const notificationService = {
		notify: async (events: NotificationEvent[]) => {
			log.emails.push(...events);
			return { success: true, data: { queued: events.length } };
		},
	} as unknown as ICradle["notificationService"];

	return {
		issuance: createCertificateIssuance({
			certificateRepository,
			notificationService,
		}),
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

	test("avisa por correo a cada emisión nueva, con el mensaje del curso", async () => {
		const { issuance, log } = createHarness({
			delivery: { isDownloadable: false, emailMessage: "¡Felicidades!" },
		});

		await issuance.sync(7, [ana, luis], AT);

		expect(log.emails).toEqual([
			{
				template: "CERTIFICATE_ISSUED",
				to: {
					email: "ana@instituto.gob.mx",
					firstName: "Ana",
					lastName: "Ruiz",
				},
				course: {
					title: "Seguridad en obra",
					dependencyName: "Secretaría de Obras Públicas",
				},
				folio: "SOP-2026-0042",
				downloadable: false,
				message: "¡Felicidades!",
			},
			expect.objectContaining({
				to: expect.objectContaining({ email: "luis@universidad.mx" }),
				folio: "SOP-2026-0043",
			}),
		]);
	});

	test("restaurar o revocar no manda correo", async () => {
		const { issuance, log } = createHarness();

		await issuance.sync(7, [ana], AT);
		await issuance.sync(7, [], AT);
		await issuance.sync(7, [ana], AT);

		expect(log.emails).toHaveLength(1);
	});

	// El correo se encola después de escribir la emisión: si la emisión falla,
	// no llega a encolarse y la transacción revierte lo demás.
	test("si la emisión falla no se encola nada", async () => {
		const { issuance, log } = createHarness({ failCreate: true });

		await expect(issuance.sync(7, [ana], AT)).rejects.toThrow();
		expect(log.emails).toEqual([]);
	});
});
