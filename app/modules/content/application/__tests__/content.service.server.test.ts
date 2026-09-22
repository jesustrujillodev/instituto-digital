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
import { CONTENT_MAX_MODULES_PER_COURSE } from "../../domain/content.config";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import type { ContentModuleRaw } from "../../domain/content.mapper";
import { createContentService } from "../content.service.server";

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
			},
			{
				documentId: LESSON_2,
				title: "Marco legal",
				type: "TEXT",
				order: 2,
				isRequired: true,
				estimatedMinutes: null,
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
	} = {},
) => {
	const calls = {
		created: [] as unknown[],
		updated: [] as unknown[],
		archived: [] as unknown[],
		reorders: [] as unknown[],
		transactions: 0,
	};

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
			documentId === LESSON_1 ? { id: 31, moduleId: 21 } : null,
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
	} as unknown as ICradle["contentRepository"];

	const runInTransaction = (async <T>(work: () => Promise<T>) => {
		calls.transactions += 1;
		return work();
	}) as unknown as ICradle["runInTransaction"];

	return {
		service: createContentService({
			contentRepository,
			runInTransaction,
			clock: { now: () => NOW },
			logger: silentLogger,
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
