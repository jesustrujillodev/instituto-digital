import { describe, expect, test } from "vitest";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { toProxyRef } from "@/shared/storage/public-url";
import { actorOf, COURSE_DOC } from "../../domain/__tests__/content.fixtures";
import {
	SESSION_MATERIAL_MAX_PER_SESSION,
	SESSION_MATERIAL_PREFIX,
} from "../../domain/content.config";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import type {
	SessionMaterialRaw,
	SessionMaterialsRaw,
	SessionMaterialWrite,
} from "../../domain/session-material.types";
import { createLessonMaterialReader } from "../lesson-material.reader.server";
import { createSessionMaterialService } from "../session-material.service.server";

const NOW = new Date("2026-10-10T18:00:00.000Z");
const SESSION = "33333333-3333-4333-8333-333333333333";
const MATERIAL = "44444444-4444-4444-8444-444444444444";
const KEY = `${SESSION_MATERIAL_PREFIX}/presentacion-1700000000.pdf`;

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const materialOf = (
	overrides: Partial<SessionMaterialRaw> = {},
): SessionMaterialRaw => ({
	documentId: MATERIAL,
	type: "FILE",
	title: "Presentación",
	fileUrl: toProxyRef(KEY),
	fileName: "presentacion.pdf",
	fileSize: 2048,
	mimeType: "application/pdf",
	externalUrl: null,
	availableFromSession: false,
	...overrides,
});

const sessionOf = (
	startsAt: Date,
	materials: SessionMaterialRaw[] = [materialOf()],
): SessionMaterialsRaw => ({
	documentId: SESSION,
	startsAt,
	endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
	materials,
});

const createHarness = (
	options: {
		course?: { id: number; status: CourseStatus } | null;
		session?: { id: number; materialCount: number } | null;
		material?: { id: number; fileUrl: string | null } | null;
		sessions?: SessionMaterialsRaw[];
		/** `null`: quien pregunta no está inscrito. */
		participantSessions?: SessionMaterialsRaw[] | null;
		stat?: { size: number } | null;
	} = {},
) => {
	const calls = {
		courseWhere: [] as unknown[],
		created: [] as { sessionId: number; write: SessionMaterialWrite }[],
		updated: [] as { id: number; patch: unknown }[],
		removed: [] as number[],
		deleted: [] as string[],
	};

	const sessionMaterialRepository = {
		findCourse: async (_documentId: string, where: unknown) => {
			calls.courseWhere.push(where);
			return options.course === undefined
				? { id: 7, status: "PUBLISHED" as const }
				: options.course;
		},
		findSessions: async () => options.sessions ?? [],
		findSessionsForParticipant: async () =>
			options.participantSessions === undefined
				? []
				: options.participantSessions,
		findSession: async () =>
			options.session === undefined
				? { id: 11, materialCount: 0 }
				: options.session,
		findMaterial: async () =>
			options.material === undefined
				? { id: 21, fileUrl: toProxyRef(KEY) }
				: options.material,
		create: async (sessionId: number, write: SessionMaterialWrite) => {
			calls.created.push({ sessionId, write });
			return { documentId: MATERIAL };
		},
		update: async (id: number, patch: unknown) => {
			calls.updated.push({ id, patch });
		},
		remove: async (id: number) => {
			calls.removed.push(id);
		},
	} as unknown as ICradle["sessionMaterialRepository"];

	const storageProvider = {
		getUploadUrl: async (_bucket: string, key: string) =>
			`https://bucket.example/${key}?signature=write`,
		getPresignedUrl: async (_bucket: string, key: string) =>
			`https://bucket.example/${key}?signature=read`,
		statObject: async (_bucket: string, key: string) =>
			options.stat === undefined
				? { key, size: 1024, lastModified: NOW }
				: options.stat,
		deleteFile: async (_bucket: string, key: string) => {
			calls.deleted.push(key);
		},
	} as unknown as ICradle["storageProvider"];

	return {
		service: createSessionMaterialService({
			sessionMaterialRepository,
			// La real: lo que se mide es qué URL firmada sale.
			lessonMaterialReader: createLessonMaterialReader({
				storageProvider,
				storageBucket: "instituto",
				storagePublicBucket: null,
			}),
			clock: { now: () => NOW },
			logger: silentLogger,
			storageProvider,
			storageBucket: "instituto",
			storagePublicBucket: null,
		}),
		calls,
	};
};

const fileDto = {
	sessionDocumentId: SESSION,
	type: "FILE" as const,
	title: "Presentación",
	availableFromSession: true,
	key: KEY,
	fileName: "presentacion.pdf",
	mimeType: "application/pdf",
};

describe("findBoard", () => {
	test("firma cada archivo para abrirlo", async () => {
		const { service } = createHarness({ sessions: [sessionOf(NOW)] });

		const result = await service.findBoard(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: {
				editable: true,
				sessions: [
					{
						materials: [
							{
								fileUrl: `https://bucket.example/${KEY}?signature=read`,
								downloadUrl: `https://bucket.example/${KEY}?signature=read`,
							},
						],
					},
				],
			},
		});
	});

	test("un curso finalizado se consulta, pero ya no se edita", async () => {
		const { service } = createHarness({
			course: { id: 7, status: "FINISHED" },
		});

		const result = await service.findBoard(COURSE_DOC, actorOf());

		expect(result).toMatchObject({ success: true, data: { editable: false } });
	});

	test("sin alcance de administración ni de impartición ni se consulta", async () => {
		const { service, calls } = createHarness();

		const result = await service.findBoard(
			COURSE_DOC,
			actorOf({ role: "USER", dependencyId: null, isTrainer: false }),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.courseWhere).toHaveLength(0);
	});
});

describe("findForParticipant", () => {
	test("lo que se abre desde la sesión viaja sin enlaces hasta que empieza", async () => {
		const later = new Date("2026-10-16T16:00:00.000Z");
		const { service } = createHarness({
			participantSessions: [
				sessionOf(later, [
					materialOf({ availableFromSession: true }),
					materialOf({
						documentId: "55555555-5555-4555-8555-555555555555",
						type: "LINK",
						title: "Formulario",
						fileUrl: null,
						fileName: null,
						fileSize: null,
						mimeType: null,
						externalUrl: "https://forms.example/x",
					}),
				]),
			],
		});

		const result = await service.findForParticipant(COURSE_DOC, actorOf());

		expect(result.success && result.data[0].materials).toEqual([
			{
				state: "locked",
				documentId: MATERIAL,
				type: "FILE",
				title: "Presentación",
				availableAt: later,
			},
			expect.objectContaining({
				state: "available",
				externalUrl: "https://forms.example/x",
			}),
		]);
	});

	test("una vez empezada la sesión, se abre", async () => {
		const { service } = createHarness({
			participantSessions: [
				sessionOf(new Date("2026-10-10T17:00:00.000Z"), [
					materialOf({ availableFromSession: true }),
				]),
			],
		});

		const result = await service.findForParticipant(COURSE_DOC, actorOf());

		expect(result.success && result.data[0].materials[0]).toMatchObject({
			state: "available",
			fileUrl: `https://bucket.example/${KEY}?signature=read`,
		});
	});

	test("quien no está inscrito no ve material", async () => {
		const { service } = createHarness({ participantSessions: null });

		expect(
			await service.findForParticipant(COURSE_DOC, actorOf()),
		).toMatchObject({
			success: true,
			data: [],
		});
	});
});

describe("createUploadUrl", () => {
	const uploadDto = {
		sessionDocumentId: SESSION,
		kind: "FILE" as const,
		fileName: "presentacion.pdf",
		contentType: "application/pdf",
		size: 2048,
	};

	test("emite una key del prefijo de sesiones", async () => {
		const { service } = createHarness();

		const result = await service.createUploadUrl(
			COURSE_DOC,
			uploadDto,
			actorOf(),
		);

		expect(result.success && result.data.key).toMatch(
			new RegExp(`^${SESSION_MATERIAL_PREFIX}/`),
		);
	});

	// La fila del alta todavía sin guardar: el material se crea al guardar.
	test("sin sesión, sube para una sesión que el alta aún no guarda", async () => {
		const { service } = createHarness({ session: null });

		const { sessionDocumentId: _session, ...withoutSession } = uploadDto;
		const result = await service.createUploadUrl(
			COURSE_DOC,
			withoutSession,
			actorOf(),
		);

		expect(result.success).toBe(true);
	});

	test("una sesión de otro curso responde como inexistente", async () => {
		const { service } = createHarness({ session: null });

		expect(
			await service.createUploadUrl(COURSE_DOC, uploadDto, actorOf()),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.SESSION_NOT_FOUND },
		});
	});
});

describe("create", () => {
	test("guarda el archivo por su referencia del proxy y su tamaño real", async () => {
		const { service, calls } = createHarness({ stat: { size: 4096 } });

		const result = await service.create(COURSE_DOC, fileDto, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { documentId: MATERIAL },
		});
		expect(calls.created).toEqual([
			{
				sessionId: 11,
				write: {
					type: "FILE",
					title: "Presentación",
					availableFromSession: true,
					fileUrl: toProxyRef(KEY),
					fileName: "presentacion.pdf",
					fileSize: 4096,
					mimeType: "application/pdf",
					externalUrl: null,
				},
			},
		]);
	});

	test("un enlace no deja columnas de archivo", async () => {
		const { service, calls } = createHarness();

		await service.create(
			COURSE_DOC,
			{
				sessionDocumentId: SESSION,
				type: "LINK",
				title: "Formulario",
				availableFromSession: false,
				externalUrl: "https://forms.example/x",
			},
			actorOf(),
		);

		expect(calls.created[0].write).toMatchObject({
			fileUrl: null,
			fileName: null,
			externalUrl: "https://forms.example/x",
		});
	});

	test("una subida que no llegó no se guarda", async () => {
		const { service, calls } = createHarness({ stat: null });

		expect(await service.create(COURSE_DOC, fileDto, actorOf())).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.UPLOAD_NOT_FOUND },
		});
		expect(calls.created).toHaveLength(0);
	});

	test("una sesión llena no admite otro", async () => {
		const { service, calls } = createHarness({
			session: { id: 11, materialCount: SESSION_MATERIAL_MAX_PER_SESSION },
		});

		expect(await service.create(COURSE_DOC, fileDto, actorOf())).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.TOO_MANY_SESSION_MATERIALS },
		});
		expect(calls.created).toHaveLength(0);
	});

	test.each(["FINISHED", "CANCELLED"] as const)(
		"un curso %s no admite material nuevo",
		async (status) => {
			const { service, calls } = createHarness({ course: { id: 7, status } });

			expect(
				await service.create(COURSE_DOC, fileDto, actorOf()),
			).toMatchObject({
				success: false,
				error: { code: CONTENT_ERROR_CODES.SESSION_MATERIALS_LOCKED },
			});
			expect(calls.created).toHaveLength(0);
		},
	);

	// El capacitador lo carga sin administrar el curso.
	test("el capacitador asignado agrega material", async () => {
		const { service, calls } = createHarness();

		const result = await service.create(
			COURSE_DOC,
			fileDto,
			actorOf({ role: "USER", dependencyId: null, isTrainer: true }),
		);

		expect(result.success).toBe(true);
		expect(calls.created).toHaveLength(1);
	});
});

describe("update", () => {
	test("cambia el nombre y cuándo se ve", async () => {
		const { service, calls } = createHarness();

		const result = await service.update(
			COURSE_DOC,
			{
				materialDocumentId: MATERIAL,
				title: "Presentación final",
				availableFromSession: true,
			},
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.updated).toEqual([
			{
				id: 21,
				patch: { title: "Presentación final", availableFromSession: true },
			},
		]);
	});

	test("material de otro curso responde como inexistente", async () => {
		const { service, calls } = createHarness({ material: null });

		expect(
			await service.update(
				COURSE_DOC,
				{
					materialDocumentId: MATERIAL,
					title: "X",
					availableFromSession: false,
				},
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.SESSION_MATERIAL_NOT_FOUND },
		});
		expect(calls.updated).toHaveLength(0);
	});
});

describe("remove", () => {
	test("borra la fila y después suelta el objeto", async () => {
		const { service, calls } = createHarness();

		const result = await service.remove(
			COURSE_DOC,
			{ materialDocumentId: MATERIAL },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.removed).toEqual([21]);
		expect(calls.deleted).toEqual([KEY]);
	});

	test("un enlace no tiene objeto que soltar", async () => {
		const { service, calls } = createHarness({
			material: { id: 21, fileUrl: null },
		});

		await service.remove(
			COURSE_DOC,
			{ materialDocumentId: MATERIAL },
			actorOf(),
		);

		expect(calls.removed).toEqual([21]);
		expect(calls.deleted).toEqual([]);
	});

	test("un curso cancelado conserva su material", async () => {
		const { service, calls } = createHarness({
			course: { id: 7, status: "CANCELLED" },
		});

		expect(
			await service.remove(
				COURSE_DOC,
				{ materialDocumentId: MATERIAL },
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.SESSION_MATERIALS_LOCKED },
		});
		expect(calls.removed).toHaveLength(0);
	});
});
