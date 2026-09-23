import { describe, expect, test } from "vitest";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	actorOf,
	COURSE_DOC,
	LESSON_1,
	LESSON_2,
	LESSON_3,
	MODULE_A,
	MODULE_B,
	OTHER_DOC,
} from "../../domain/__tests__/content.fixtures";
import {
	CONTENT_MAX_MODULES_PER_COURSE,
	LESSON_FILE,
	LESSON_MATERIAL_PREFIX,
} from "../../domain/content.config";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import type {
	ContentModuleRaw,
	LessonMaterialRaw,
} from "../../domain/content.mapper";
import type { LessonType } from "../../domain/content.rules";
import { createContentService } from "../content.service.server";
import { createLessonMaterialReader } from "../lesson-material.reader.server";

const NOW = new Date("2026-09-21T18:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const RAW: ContentModuleRaw[] = [
	{
		documentId: MODULE_A,
		title: "Fundamentos",
		description: null,
		order: 1,
		lessons: [
			{
				documentId: LESSON_1,
				title: "Qué es la transparencia",
				type: "TEXT",
				order: 1,
				isRequired: true,
				estimatedMinutes: null,
				content: null,
			},
			{
				documentId: LESSON_2,
				title: "Marco legal",
				type: "TEXT",
				order: 2,
				isRequired: true,
				estimatedMinutes: null,
				content: null,
			},
		],
	},
	{
		documentId: MODULE_B,
		title: "Práctica",
		description: null,
		order: 2,
		lessons: [
			{
				documentId: LESSON_3,
				title: "Caso guiado",
				type: "FILE",
				order: 1,
				isRequired: false,
				estimatedMinutes: null,
				content: null,
			},
		],
	},
];

const createHarness = (
	options: {
		/** `null` finge un curso fuera de alcance o inexistente. */
		course?: { id: number; status: CourseStatus; format: "SELF_PACED" } | null;
		modules?: number;
		activeLessons?: number;
		lessonType?: LessonType;
		material?: LessonMaterialRaw["content"];
		materialFileUrl?: string | null;
		/** `null` finge un objeto que la subida nunca dejó en el bucket. */
		stat?: { key: string; size: number; lastModified: Date | null } | null;
	} = {},
) => {
	const calls = {
		created: [] as unknown[],
		updated: [] as unknown[],
		archived: [] as unknown[],
		reorders: [] as unknown[],
		materials: [] as unknown[],
		uploadUrls: [] as unknown[],
		signed: [] as unknown[],
		deleted: [] as string[],
		transactions: 0,
		recalculated: [] as { courseId: number; inTransaction: boolean }[],
	};
	let inTransaction = false;

	const contentRepository = {
		findCourse: async () =>
			options.course === undefined
				? { id: 7, status: "DRAFT" as CourseStatus, format: "SELF_PACED" }
				: options.course,
		findTree: async () => structuredClone(RAW),
		findModuleSiblings: async () =>
			Array.from(
				{ length: options.modules ?? RAW.length },
				(_value, index) => ({
					documentId: index === 0 ? MODULE_A : `module-${index}`,
					order: index + 1,
				}),
			),
		findLessonSiblings: async () => [
			{ documentId: LESSON_1, order: 1 },
			{ documentId: LESSON_2, order: 2 },
		],
		findModule: async (_courseId: number, documentId: string) =>
			documentId === MODULE_A
				? { id: 21, activeLessons: options.activeLessons ?? 0 }
				: null,
		findLesson: async (_courseId: number, documentId: string) =>
			documentId === LESSON_1
				? {
						id: 31,
						moduleId: 21,
						type: options.lessonType ?? "TEXT",
						isRequired: true,
					}
				: null,
		createModule: async (courseId: number, data: unknown) => {
			calls.created.push({ courseId, data });
		},
		updateModule: async (moduleId: number, data: unknown) => {
			calls.updated.push({ moduleId, data });
		},
		archiveModule: async (moduleId: number, at: Date, reorder: unknown) => {
			calls.archived.push({ moduleId, at, reorder });
		},
		createLesson: async (moduleId: number, data: unknown) => {
			calls.created.push({ moduleId, data });
		},
		updateLesson: async (lessonId: number, data: unknown) => {
			calls.updated.push({ lessonId, data });
		},
		archiveLesson: async (lessonId: number, at: Date, reorder: unknown) => {
			calls.archived.push({ lessonId, at, reorder });
		},
		saveOrder: async (writes: unknown) => {
			calls.reorders.push(writes);
		},
		findMaterial: async (_courseId: number, documentId: string) =>
			documentId === LESSON_1
				? {
						documentId: LESSON_1,
						title: "Qué es la transparencia",
						type: options.lessonType ?? "TEXT",
						content: options.material ?? null,
					}
				: null,
		saveMaterial: async (lessonId: number, data: unknown) => {
			calls.materials.push({ lessonId, data });
		},
		findMaterialFileUrl: async () => options.materialFileUrl ?? null,
	} as unknown as ICradle["contentRepository"];

	const storageProvider = {
		getUploadUrl: async (bucket: string, key: string, opts: unknown) => {
			calls.uploadUrls.push({ bucket, key, opts });
			return `https://bucket.example/${key}?signature=upload`;
		},
		getPresignedUrl: async (
			bucket: string,
			key: string,
			ttl?: number,
			opts?: unknown,
		) => {
			calls.signed.push({ bucket, key, ttl, opts });
			return `https://bucket.example/${key}?signature=read`;
		},
		statObject: async (_bucket: string, key: string) =>
			options.stat === undefined
				? { key, size: 1024, lastModified: NOW }
				: options.stat,
		deleteFile: async (_bucket: string, key: string) => {
			calls.deleted.push(key);
		},
	} as unknown as ICradle["storageProvider"];

	const runInTransaction = (async <T>(work: () => Promise<T>) => {
		calls.transactions += 1;
		inTransaction = true;
		try {
			return await work();
		} finally {
			inTransaction = false;
		}
	}) as unknown as ICradle["runInTransaction"];

	const progressSync = {
		recalculate: async (course: { id: number }) => {
			calls.recalculated.push({ courseId: course.id, inTransaction });
			return [];
		},
	} as unknown as ICradle["progressSync"];

	return {
		service: createContentService({
			contentRepository,
			runInTransaction,
			clock: { now: () => NOW },
			logger: silentLogger,
			storageProvider,
			storageBucket: "instituto",
			storagePublicBucket: null,
			// La real: estas pruebas miden qué URL firmada sale, no que se llame.
			lessonMaterialReader: createLessonMaterialReader({
				storageProvider,
				storageBucket: "instituto",
				storagePublicBucket: null,
			}),
			progressSync,
		}),
		calls,
	};
};

const moduleDto = { title: "Fundamentos", description: null };
const lessonDto = {
	moduleDocumentId: MODULE_A,
	title: "Marco legal",
	type: "TEXT" as const,
	isRequired: true,
	estimatedMinutes: null,
};

describe("findTree", () => {
	test("devuelve el temario en el envelope", async () => {
		const { service } = createHarness();

		const result = await service.findTree(COURSE_DOC, actorOf());

		expect(result).toMatchObject({ success: true });
		expect(result.success && result.data).toHaveLength(2);
	});

	test("un curso fuera de alcance responde como inexistente", async () => {
		const { service } = createHarness({ course: null });

		expect(await service.findTree(COURSE_DOC, actorOf())).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});

	test("sin alcance de administración ni se consulta el curso", async () => {
		const { service } = createHarness();

		expect(
			await service.findTree(
				COURSE_DOC,
				actorOf({ role: "USER", isTrainer: false }),
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});
});

describe("summarize", () => {
	test("cuenta lo que el pendiente de publicación necesita", async () => {
		const { service } = createHarness();

		expect(await service.summarize(COURSE_DOC, actorOf())).toMatchObject({
			success: true,
			data: { moduleCount: 2, lessonCount: 3, requiredLessonCount: 2 },
		});
	});
});

describe("createModule", () => {
	test("el módulo nuevo nace al final", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.createModule(COURSE_DOC, moduleDto, actorOf()),
		).toMatchObject({ success: true });
		expect(calls.created).toEqual([
			{ courseId: 7, data: { ...moduleDto, order: 3 } },
		]);
	});

	test("en el tope no entra uno más", async () => {
		const { service, calls } = createHarness({
			modules: CONTENT_MAX_MODULES_PER_COURSE,
		});

		expect(
			await service.createModule(COURSE_DOC, moduleDto, actorOf()),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.TOO_MANY_MODULES },
		});
		expect(calls.created).toEqual([]);
	});

	test("un curso finalizado ya no cambia de temario", async () => {
		const { service, calls } = createHarness({
			course: { id: 7, status: "FINISHED", format: "SELF_PACED" },
		});

		expect(
			await service.createModule(COURSE_DOC, moduleDto, actorOf()),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE },
		});
		expect(calls.created).toEqual([]);
	});
});

describe("updateModule", () => {
	test("un módulo de otro curso no se toca", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.updateModule(
				COURSE_DOC,
				{ moduleDocumentId: OTHER_DOC, ...moduleDto },
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.MODULE_NOT_FOUND },
		});
		expect(calls.updated).toEqual([]);
	});
});

describe("archiveModule", () => {
	test("archiva con la fecha del reloj y re-empaqueta a sus hermanos", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.archiveModule(COURSE_DOC, MODULE_A, actorOf()),
		).toMatchObject({ success: true });
		expect(calls.archived).toEqual([
			{
				moduleId: 21,
				at: NOW,
				reorder: [{ documentId: "module-1", order: 1 }],
			},
		]);
		expect(calls.transactions).toBe(1);
	});

	test("con lecciones activas no se archiva", async () => {
		const { service, calls } = createHarness({ activeLessons: 2 });

		expect(
			await service.archiveModule(COURSE_DOC, MODULE_A, actorOf()),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.MODULE_NOT_EMPTY },
		});
		expect(calls.archived).toEqual([]);
	});
});

describe("lecciones", () => {
	test("la lección nueva nace al final de su módulo", async () => {
		const { service, calls } = createHarness({ activeLessons: 2 });

		expect(
			await service.createLesson(COURSE_DOC, lessonDto, actorOf()),
		).toMatchObject({ success: true });
		expect(calls.created).toEqual([
			{
				moduleId: 21,
				data: {
					title: lessonDto.title,
					type: "TEXT",
					isRequired: true,
					estimatedMinutes: null,
					order: 3,
				},
			},
		]);
	});

	test("una lección de otro curso no se edita", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.updateLesson(
				COURSE_DOC,
				{
					lessonDocumentId: OTHER_DOC,
					title: "Marco legal",
					type: "TEXT",
					isRequired: true,
					estimatedMinutes: null,
				},
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.LESSON_NOT_FOUND },
		});
		expect(calls.updated).toEqual([]);
	});

	test("archivar una lección re-empaqueta a sus hermanas", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.archiveLesson(COURSE_DOC, LESSON_1, actorOf()),
		).toMatchObject({ success: true });
		expect(calls.archived).toEqual([
			{ lessonId: 31, at: NOW, reorder: [{ documentId: LESSON_2, order: 1 }] },
		]);
		expect(calls.transactions).toBe(1);
	});
});

describe("reorder", () => {
	test("el orden nuevo se escribe dentro de una transacción", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.reorder(
				COURSE_DOC,
				{
					modules: [MODULE_B, MODULE_A],
					lessons: [
						{
							moduleDocumentId: MODULE_A,
							lessonDocumentIds: [LESSON_2, LESSON_1],
						},
						{ moduleDocumentId: MODULE_B, lessonDocumentIds: [LESSON_3] },
					],
				},
				actorOf(),
			),
		).toMatchObject({ success: true });
		expect(calls.transactions).toBe(1);
		expect(calls.reorders).toHaveLength(1);
	});

	test("un orden que no es permutación no escribe nada", async () => {
		const { service, calls } = createHarness();

		expect(
			await service.reorder(
				COURSE_DOC,
				{
					modules: [MODULE_A],
					lessons: [
						{
							moduleDocumentId: MODULE_A,
							lessonDocumentIds: [LESSON_1, LESSON_2],
						},
						{ moduleDocumentId: MODULE_B, lessonDocumentIds: [LESSON_3] },
					],
				},
				actorOf(),
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.INVALID_ORDER },
		});
		expect(calls.reorders).toEqual([]);
		expect(calls.transactions).toBe(0);
	});
});

describe("findMaterial", () => {
	test("firma la URL de lectura y no expone la key", async () => {
		const { service, calls } = createHarness({
			lessonType: "VIDEO",
			material: {
				body: null,
				fileUrl: "/api/storage?key=documentos%2Flecciones%2Fclase-1.mp4",
				fileName: "clase.mp4",
				fileSize: 2048,
				mimeType: "video/mp4",
				externalUrl: null,
			},
		});

		const result = await service.findMaterial(COURSE_DOC, LESSON_1, actorOf());

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.fileUrl).toBe(
			"https://bucket.example/documentos/lecciones/clase-1.mp4?signature=read",
		);
		expect(result.data.downloadUrl).toContain("signature=read");
		expect(calls.signed).toHaveLength(2);
		expect(calls.signed[0]).toMatchObject({
			bucket: "instituto",
			key: "documentos/lecciones/clase-1.mp4",
		});
	});

	test("una lección de otro curso responde con el código de no encontrada", async () => {
		const { service } = createHarness();

		const result = await service.findMaterial(COURSE_DOC, LESSON_2, actorOf());

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CONTENT_ERROR_CODES.LESSON_NOT_FOUND);
	});
});

describe("createUploadUrl", () => {
	const ticketDto = {
		lessonDocumentId: LESSON_1,
		kind: "VIDEO" as const,
		fileName: "clase.mp4",
		contentType: "video/mp4",
		size: 5_000_000,
	};

	test("firma con la key que genera el servidor, bajo el prefijo del módulo", async () => {
		const { service, calls } = createHarness({ lessonType: "VIDEO" });

		const result = await service.createUploadUrl(
			COURSE_DOC,
			ticketDto,
			actorOf(),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.key.startsWith(`${LESSON_MATERIAL_PREFIX}/`)).toBe(true);
		expect(result.data.key).not.toContain("/../");
		expect(calls.uploadUrls).toHaveLength(1);
		expect(calls.uploadUrls[0]).toMatchObject({
			bucket: "instituto",
			opts: { contentType: "video/mp4" },
		});
	});

	test("un tipo fuera de la lista se rechaza ANTES de firmar", async () => {
		const { service, calls } = createHarness({ lessonType: "VIDEO" });

		const result = await service.createUploadUrl(
			COURSE_DOC,
			{ ...ticketDto, contentType: "application/x-msdownload" },
			actorOf(),
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CONTENT_ERROR_CODES.UPLOAD_INVALID);
		expect(calls.uploadUrls).toHaveLength(0);
	});

	test("un curso que ya no admite cambios no emite permiso de subida", async () => {
		const { service, calls } = createHarness({
			course: { id: 7, status: "FINISHED", format: "SELF_PACED" },
		});

		const result = await service.createUploadUrl(
			COURSE_DOC,
			ticketDto,
			actorOf(),
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE);
		expect(calls.uploadUrls).toHaveLength(0);
	});
});

describe("saveMaterial", () => {
	const KEY = `${LESSON_MATERIAL_PREFIX}/manual-1700000000.pdf`;
	const fileDto = {
		lessonDocumentId: LESSON_1,
		type: "FILE" as const,
		key: KEY,
		fileName: "manual.pdf",
		mimeType: "application/pdf",
	};

	test("persiste la referencia del proxy, nunca la key cruda", async () => {
		const { service, calls } = createHarness({ lessonType: "FILE" });

		const result = await service.saveMaterial(COURSE_DOC, fileDto, actorOf());

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.materials).toHaveLength(1);
		expect(calls.materials[0]).toMatchObject({
			lessonId: 31,
			data: {
				fileUrl: `/api/storage?key=${encodeURIComponent(KEY)}`,
				fileName: "manual.pdf",
				fileSize: 1024,
				body: null,
				externalUrl: null,
			},
		});
	});

	test("un objeto que la subida no dejó en el bucket se rechaza", async () => {
		const { service, calls } = createHarness({
			lessonType: "FILE",
			stat: null,
		});

		const result = await service.saveMaterial(COURSE_DOC, fileDto, actorOf());

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CONTENT_ERROR_CODES.UPLOAD_NOT_FOUND);
		expect(calls.materials).toHaveLength(0);
	});

	test("el tope se impone al confirmar, que es donde la firma no llega", async () => {
		const { service, calls } = createHarness({
			lessonType: "FILE",
			stat: { key: KEY, size: LESSON_FILE.maxBytes + 1, lastModified: null },
		});

		const result = await service.saveMaterial(COURSE_DOC, fileDto, actorOf());

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CONTENT_ERROR_CODES.UPLOAD_TOO_LARGE);
		expect(calls.materials).toHaveLength(0);
	});

	test("material de otra clase que la lección se rechaza por su código", async () => {
		const { service, calls } = createHarness({ lessonType: "TEXT" });

		const result = await service.saveMaterial(COURSE_DOC, fileDto, actorOf());

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CONTENT_ERROR_CODES.MATERIAL_MISMATCH);
		expect(calls.materials).toHaveLength(0);
	});

	test("reemplazar borra el objeto anterior", async () => {
		const previous = `${LESSON_MATERIAL_PREFIX}/viejo-1600000000.pdf`;
		const { service, calls } = createHarness({
			lessonType: "FILE",
			materialFileUrl: `/api/storage?key=${encodeURIComponent(previous)}`,
		});

		await service.saveMaterial(COURSE_DOC, fileDto, actorOf());

		expect(calls.deleted).toEqual([previous]);
	});

	test("guardar un cuerpo de texto no toca el storage", async () => {
		const { service, calls } = createHarness({ lessonType: "TEXT" });

		const result = await service.saveMaterial(
			COURSE_DOC,
			{
				lessonDocumentId: LESSON_1,
				type: "TEXT",
				body: {
					type: "doc",
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "Hola" }] },
					],
				},
			},
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.deleted).toEqual([]);
		expect(calls.materials[0]).toMatchObject({
			data: { fileUrl: null, externalUrl: null },
		});
	});
});

describe("archivar una lección con material", () => {
	test("se lleva su objeto del bucket", async () => {
		const key = `${LESSON_MATERIAL_PREFIX}/manual-1700000000.pdf`;
		const { service, calls } = createHarness({
			lessonType: "FILE",
			materialFileUrl: `/api/storage?key=${encodeURIComponent(key)}`,
		});

		const result = await service.archiveLesson(COURSE_DOC, LESSON_1, actorOf());

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.transactions).toBe(1);
		expect(calls.deleted).toEqual([key]);
	});

	test("una lección sin material se archiva sin tocar el bucket", async () => {
		const { service, calls } = createHarness();

		await service.archiveLesson(COURSE_DOC, LESSON_1, actorOf());

		expect(calls.deleted).toEqual([]);
	});
});

// docs/adr/0014: cambiar qué lecciones cuentan mueve el porcentaje de todo
// inscrito, y el caché se recalcula en la misma transacción.
describe("avance tras cambiar el temario", () => {
	const published = {
		id: 7,
		status: "PUBLISHED" as CourseStatus,
		format: "SELF_PACED" as const,
	};

	test("archivar una lección de un curso publicado recalcula dentro de la transacción", async () => {
		const { service, calls } = createHarness({ course: published });

		await service.archiveLesson(COURSE_DOC, LESSON_1, actorOf());

		expect(calls.recalculated).toEqual([{ courseId: 7, inTransaction: true }]);
	});

	test("una lección obligatoria nueva recalcula", async () => {
		const { service, calls } = createHarness({ course: published });

		await service.createLesson(
			COURSE_DOC,
			{
				moduleDocumentId: MODULE_A,
				title: "Cierre",
				type: "TEXT",
				isRequired: true,
				estimatedMinutes: null,
			},
			actorOf(),
		);

		expect(calls.recalculated).toEqual([{ courseId: 7, inTransaction: true }]);
	});

	test("volverla opcional recalcula; editar solo el título no", async () => {
		const { service, calls } = createHarness({ course: published });
		const lesson = {
			lessonDocumentId: LESSON_1,
			title: "Nuevo título",
			type: "TEXT" as const,
			estimatedMinutes: null,
		};

		await service.updateLesson(
			COURSE_DOC,
			{ ...lesson, isRequired: true },
			actorOf(),
		);
		expect(calls.recalculated).toEqual([]);

		await service.updateLesson(
			COURSE_DOC,
			{ ...lesson, isRequired: false },
			actorOf(),
		);
		expect(calls.recalculated).toHaveLength(1);
	});

	test("un borrador no tiene avance que recalcular", async () => {
		const { service, calls } = createHarness();

		await service.archiveLesson(COURSE_DOC, LESSON_1, actorOf());

		expect(calls.recalculated).toEqual([]);
	});
});
