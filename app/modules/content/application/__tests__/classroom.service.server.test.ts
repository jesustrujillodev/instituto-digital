import { describe, expect, test } from "vitest";
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
} from "../../domain/__tests__/content.fixtures";
import type { LessonProgressStatus } from "../../domain/classroom.rules";
import type {
	ClassroomCourse,
	LessonProgressRow,
} from "../../domain/classroom.types";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import type { ContentModuleRaw } from "../../domain/content.mapper";
import { createClassroomService } from "../classroom.service.server";

const NOW = new Date("2027-03-10T18:00:00.000Z");
const ANA = actorOf({ userId: 50, role: "USER" });

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const lessonRaw = (
	documentId: string,
	order: number,
	isRequired = true,
): ContentModuleRaw["lessons"][number] => ({
	documentId,
	title: `Lección ${order}`,
	type: "TEXT",
	order,
	isRequired,
	estimatedMinutes: null,
	content: null,
});

const TREE: ContentModuleRaw[] = [
	{
		documentId: MODULE_A,
		title: "Fundamentos",
		description: null,
		order: 1,
		lessons: [lessonRaw(LESSON_1, 1), lessonRaw(LESSON_2, 2)],
	},
	{
		documentId: MODULE_B,
		title: "Práctica",
		description: null,
		order: 2,
		lessons: [lessonRaw(LESSON_3, 1, false)],
	},
];

const courseOf = (
	overrides: Partial<ClassroomCourse> = {},
): ClassroomCourse => ({
	id: 7,
	documentId: COURSE_DOC,
	title: "Transparencia",
	status: "PUBLISHED",
	format: "SELF_PACED",
	completionRule: "CONTENT",
	enrollment: {
		status: "ENROLLED",
		progressPercent: 0,
		contentCompletedAt: null,
		completed: false,
	},
	...overrides,
});

const createHarness = (
	options: {
		course?: ClassroomCourse | null;
		progress?: LessonProgressRow[];
	} = {},
) => {
	let progress = structuredClone(options.progress ?? []);
	let inTransaction = false;
	const calls = {
		saved: [] as { lessonId: number; status: LessonProgressStatus }[],
		recalculated: [] as {
			userIds: readonly number[] | undefined;
			inTransaction: boolean;
		}[],
	};

	const classroomRepository = {
		findCourse: async (documentId: string) =>
			documentId === COURSE_DOC
				? options.course === undefined
					? courseOf()
					: options.course
				: null,
		findProgress: async () => structuredClone(progress),
		saveProgress: async (
			lessonId: number,
			_userId: number,
			status: LessonProgressStatus,
		) => {
			calls.saved.push({ lessonId, status });
			const lessonDocumentId = lessonId === 31 ? LESSON_1 : LESSON_2;
			progress = [
				...progress.filter((row) => row.lessonDocumentId !== lessonDocumentId),
				{ lessonDocumentId, status },
			];
		},
		findClassroomCourses: async () => [COURSE_DOC],
	} as unknown as ICradle["classroomRepository"];

	const contentRepository = {
		findTree: async () => structuredClone(TREE),
		findLesson: async (_courseId: number, documentId: string) =>
			documentId === LESSON_1
				? { id: 31, moduleId: 21, type: "TEXT", isRequired: true }
				: documentId === LESSON_2
					? { id: 32, moduleId: 21, type: "TEXT", isRequired: true }
					: null,
		findMaterial: async (_courseId: number, documentId: string) => ({
			documentId,
			title: "Lección",
			type: "TEXT",
			content: null,
		}),
	} as unknown as ICradle["contentRepository"];

	const progressSync = {
		recalculate: async (
			_course: unknown,
			_actorId: number,
			_at: Date,
			userIds?: readonly number[],
		) => {
			calls.recalculated.push({ userIds, inTransaction });
			const completed = progress.filter((row) => row.status === "COMPLETED");
			const percent = Math.floor((completed.length * 100) / 2);
			return [{ userId: 50, percent, contentCompleted: percent === 100 }];
		},
	} as unknown as ICradle["progressSync"];

	const runInTransaction = (async <T>(work: () => Promise<T>) => {
		inTransaction = true;
		try {
			return await work();
		} finally {
			inTransaction = false;
		}
	}) as unknown as ICradle["runInTransaction"];

	const service = createClassroomService({
		classroomRepository,
		contentRepository,
		lessonMaterialReader: {
			sign: async (material) => material,
		} as ICradle["lessonMaterialReader"],
		progressSync,
		runInTransaction,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

describe("recordProgress", () => {
	test("completar una lección recalcula el avance de quien la completa", async () => {
		const { service, calls } = createHarness({
			progress: [{ lessonDocumentId: LESSON_2, status: "COMPLETED" }],
		});

		const result = await service.recordProgress(
			COURSE_DOC,
			{ lessonDocumentId: LESSON_1, status: "COMPLETED" },
			ANA,
		);

		expect(result).toMatchObject({
			success: true,
			data: { percent: 100, contentCompleted: true },
		});
		expect(calls.saved).toEqual([{ lessonId: 31, status: "COMPLETED" }]);
		expect(calls.recalculated).toEqual([
			{ userIds: [50], inTransaction: true },
		]);
	});

	test("abrir una lección la deja empezada sin recalcular", async () => {
		const { service, calls } = createHarness();

		const result = await service.recordProgress(
			COURSE_DOC,
			{ lessonDocumentId: LESSON_1, status: "IN_PROGRESS" },
			ANA,
		);

		expect(result).toMatchObject({ success: true, data: { percent: 0 } });
		expect(calls.saved).toEqual([{ lessonId: 31, status: "IN_PROGRESS" }]);
		expect(calls.recalculated).toEqual([]);
	});

	// No se desmarca: reabrirla no la devuelve a empezada.
	test("abrir una lección completada no escribe nada", async () => {
		const { service, calls } = createHarness({
			progress: [{ lessonDocumentId: LESSON_1, status: "COMPLETED" }],
		});

		await service.recordProgress(
			COURSE_DOC,
			{ lessonDocumentId: LESSON_1, status: "IN_PROGRESS" },
			ANA,
		);

		expect(calls.saved).toEqual([]);
		expect(calls.recalculated).toEqual([]);
	});

	test("sin inscripción activa falla con error tipado y no escribe", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ enrollment: null }),
		});

		const result = await service.recordProgress(
			COURSE_DOC,
			{ lessonDocumentId: LESSON_1, status: "COMPLETED" },
			ANA,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.NOT_ENROLLED },
		});
		expect(calls.saved).toEqual([]);
	});

	test("un curso finalizado ya no registra avance", async () => {
		const { service, calls } = createHarness({
			course: courseOf({ status: "FINISHED", format: "SCHEDULED" }),
		});

		const result = await service.recordProgress(
			COURSE_DOC,
			{ lessonDocumentId: LESSON_1, status: "COMPLETED" },
			ANA,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.CLASSROOM_READ_ONLY },
		});
		expect(calls.saved).toEqual([]);
	});

	test("una lección de otro curso no existe", async () => {
		const { service } = createHarness();

		const result = await service.recordProgress(
			COURSE_DOC,
			{ lessonDocumentId: LESSON_3, status: "COMPLETED" },
			ANA,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.LESSON_NOT_FOUND },
		});
	});
});

describe("findClassroom", () => {
	test("pinta el estado de cada lección, el avance en vivo y a dónde continuar", async () => {
		const { service } = createHarness({
			progress: [
				{ lessonDocumentId: LESSON_1, status: "COMPLETED" },
				{ lessonDocumentId: LESSON_3, status: "IN_PROGRESS" },
			],
		});

		const result = await service.findClassroom(COURSE_DOC, ANA);
		if (!result.success) throw new Error("se esperaba éxito");

		expect(result.data.percent).toBe(50);
		expect(result.data.resumeLessonDocumentId).toBe(LESSON_2);
		expect(result.data.course).toMatchObject({
			countsContent: true,
			readOnly: false,
		});
		expect(
			result.data.modules.flatMap((module) =>
				module.lessons.map((lesson) => lesson.status),
			),
		).toEqual(["COMPLETED", null, "IN_PROGRESS"]);
	});

	// ADR-0014: en un curso por asistencia el temario es material de apoyo.
	test("un curso por asistencia abre el aula sin que el contenido cuente", async () => {
		const { service } = createHarness({
			course: courseOf({ format: "SCHEDULED", completionRule: "ATTENDANCE" }),
		});

		const result = await service.findClassroom(COURSE_DOC, ANA);

		expect(result).toMatchObject({
			success: true,
			data: { course: { countsContent: false } },
		});
	});

	test("quien no está inscrito no entra", async () => {
		const { service } = createHarness({
			course: courseOf({ enrollment: null }),
		});

		expect(await service.findClassroom(COURSE_DOC, ANA)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.NOT_ENROLLED },
		});
	});
});

describe("findLesson", () => {
	test("trae la lección con sus vecinas", async () => {
		const { service } = createHarness();

		const result = await service.findLesson(COURSE_DOC, LESSON_2, ANA);

		expect(result).toMatchObject({
			success: true,
			data: {
				lesson: { documentId: LESSON_2, status: null },
				previousLessonDocumentId: LESSON_1,
				nextLessonDocumentId: LESSON_3,
				readOnly: false,
			},
		});
	});

	test("una lección que no está en el temario activo no existe", async () => {
		const { service } = createHarness();

		expect(
			await service.findLesson(COURSE_DOC, "archivada", ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.LESSON_NOT_FOUND },
		});
	});
});
