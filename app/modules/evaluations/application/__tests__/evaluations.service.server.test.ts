import { describe, expect, test } from "vitest";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	ANA_DOC,
	actorOf,
	COURSE_DOC,
	EVALUATION_DOC,
	LUIS_DOC,
	SESSION_DOC,
	targetOf,
} from "../../domain/__tests__/evaluation.fixtures";
import { EVALUATIONS_PER_COURSE_LIMIT } from "../../domain/evaluation.config";
import { EVALUATION_ERROR_CODES } from "../../domain/evaluation.errors";
import type { EvaluationRaw } from "../../domain/evaluation.mapper";
import type {
	EvaluationResultWrite,
	EvaluationTarget,
} from "../../domain/evaluation.types";
import { createEvaluationService } from "../evaluations.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

/** Titular de Obras Públicas: el único que corrige un curso ya finalizado. */
const HEAD = actorOf({ userId: 2, role: "DEPENDENCY_HEAD", isTrainer: false });
/** Capacitador del curso, sin dependencia organizadora detrás. */
const TRAINER = actorOf({ dependencyId: null });

/**
 * Doble en memoria: lo que escribe cambia lo que la siguiente lectura devuelve,
 * que es lo que hace falta para probar que un envío repetido no toca nada.
 */
const createHarness = (
	options: {
		status?: CourseStatus;
		evaluationCount?: number;
		target?: EvaluationTarget | null;
		board?: EvaluationRaw[];
	} = {},
) => {
	const status = options.status ?? "PUBLISHED";
	const target =
		options.target === undefined
			? targetOf({ course: { id: 10, status, dependencyId: 3 } })
			: options.target;

	const log = {
		created: [] as { title: string; sessionId: number | null }[],
		updated: [] as { title: string; sessionId: number | null }[],
		removed: [] as number[],
		saved: [] as { writes: EvaluationResultWrite[]; deletes: number[] }[],
		transactions: 0,
	};

	const evaluationRepository = {
		findCourse: async (courseDocumentId: string) =>
			courseDocumentId === COURSE_DOC
				? {
						id: 10,
						status,
						dependencyId: 3,
						evaluationCount: options.evaluationCount ?? 0,
					}
				: null,
		findBoard: async () => structuredClone(options.board ?? []),
		findTarget: async (
			courseDocumentId: string,
			evaluationDocumentId: string,
		) =>
			courseDocumentId === COURSE_DOC && evaluationDocumentId === EVALUATION_DOC
				? structuredClone(target)
				: null,
		findSessionId: async (_courseId: number, sessionDocumentId: string) =>
			sessionDocumentId === SESSION_DOC ? 100 : null,
		create: async (data: { title: string; sessionId: number | null }) => {
			log.created.push({ title: data.title, sessionId: data.sessionId });
		},
		update: async (
			_id: number,
			data: { title: string; sessionId: number | null },
		) => {
			log.updated.push(data);
		},
		remove: async (id: number) => {
			log.removed.push(id);
		},
		saveResults: async (
			_id: number,
			writes: EvaluationResultWrite[],
			deletes: number[],
		) => {
			log.saved.push({ writes: [...writes], deletes: [...deletes] });
			if (!target) return;

			for (const write of writes) {
				target.results = [
					...target.results.filter((row) => row.userId !== write.userId),
					write,
				];
			}
			target.results = target.results.filter(
				(row) => !deletes.includes(row.userId),
			);
		},
	} as unknown as ICradle["evaluationRepository"];

	const runInTransaction = (async <T>(work: () => Promise<T>) => {
		log.transactions += 1;
		return work();
	}) as unknown as ICradle["runInTransaction"];

	return {
		service: createEvaluationService({
			evaluationRepository,
			runInTransaction,
			logger: silentLogger,
		}),
		log,
	};
};

const capture = (
	userDocumentId: string,
	passed: boolean | null,
	note: string | null,
) => ({ userDocumentId, passed, note });

describe("create", () => {
	test("crea la evaluación con la sesión resuelta", async () => {
		const { service, log } = createHarness();

		const result = await service.create(
			COURSE_DOC,
			{ title: "Práctica de campo", sessionDocumentId: SESSION_DOC },
			TRAINER,
		);

		expect(result.success).toBe(true);
		expect(log.created).toEqual([
			{ title: "Práctica de campo", sessionId: 100 },
		]);
	});

	test("una evaluación sin sesión se guarda sin sesión", async () => {
		const { service, log } = createHarness();

		await service.create(
			COURSE_DOC,
			{ title: "Proyecto final", sessionDocumentId: null },
			TRAINER,
		);

		expect(log.created).toEqual([{ title: "Proyecto final", sessionId: null }]);
	});

	test("una sesión de otro curso se rechaza", async () => {
		const { service, log } = createHarness();

		const result = await service.create(
			COURSE_DOC,
			{ title: "Práctica", sessionDocumentId: ANA_DOC },
			TRAINER,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.SESSION_NOT_FOUND },
		});
		expect(log.created).toEqual([]);
	});

	test("un curso fuera del alcance no existe", async () => {
		const { service, log } = createHarness();

		const result = await service.create(
			EVALUATION_DOC,
			{ title: "Práctica", sessionDocumentId: null },
			TRAINER,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(log.created).toEqual([]);
	});

	test("pasado el tope no se crean más", async () => {
		const { service, log } = createHarness({
			evaluationCount: EVALUATIONS_PER_COURSE_LIMIT,
		});

		const result = await service.create(
			COURSE_DOC,
			{ title: "Una más", sessionDocumentId: null },
			TRAINER,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.TOO_MANY },
		});
		expect(log.created).toEqual([]);
	});

	test("en un curso finalizado solo escribe quien corrige", async () => {
		const trainer = createHarness({ status: "FINISHED" });
		const head = createHarness({ status: "FINISHED" });

		const rejected = await trainer.service.create(
			COURSE_DOC,
			{ title: "Extraordinario", sessionDocumentId: null },
			TRAINER,
		);
		const accepted = await head.service.create(
			COURSE_DOC,
			{ title: "Extraordinario", sessionDocumentId: null },
			HEAD,
		);

		expect(rejected).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.FORBIDDEN },
		});
		expect(trainer.log.created).toEqual([]);
		expect(accepted.success).toBe(true);
		expect(head.log.created).toHaveLength(1);
	});
});

describe("update y remove", () => {
	test("una evaluación de otro curso no existe", async () => {
		const { service, log } = createHarness({ target: null });

		const result = await service.remove(COURSE_DOC, EVALUATION_DOC, TRAINER);

		expect(result).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.EVALUATION_NOT_FOUND },
		});
		expect(log.removed).toEqual([]);
	});

	test("renombrar y desvincular la sesión", async () => {
		const { service, log } = createHarness();

		const result = await service.update(
			COURSE_DOC,
			EVALUATION_DOC,
			{ title: "Práctica 1", sessionDocumentId: null },
			TRAINER,
		);

		expect(result.success).toBe(true);
		expect(log.updated).toEqual([{ title: "Práctica 1", sessionId: null }]);
	});

	test("borrar en un curso finalizado es corrección", async () => {
		const { service, log } = createHarness({ status: "FINISHED" });

		const rejected = await service.remove(COURSE_DOC, EVALUATION_DOC, TRAINER);
		const accepted = await service.remove(COURSE_DOC, EVALUATION_DOC, HEAD);

		expect(rejected).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.FORBIDDEN },
		});
		expect(accepted.success).toBe(true);
		expect(log.removed).toEqual([7]);
	});
});

describe("saveResults", () => {
	const entries = [
		capture(ANA_DOC, true, null),
		capture(LUIS_DOC, false, "No entregó la práctica"),
	];

	test("guarda lo capturado y devuelve cuántos cambios hubo", async () => {
		const { service, log } = createHarness();

		const result = await service.saveResults(
			COURSE_DOC,
			{ evaluationDocumentId: EVALUATION_DOC, entries },
			TRAINER,
		);

		expect(result).toMatchObject({ success: true, data: { affected: 2 } });
		expect(log.saved[0].writes).toEqual([
			{ userId: 50, passed: true, note: null },
			{ userId: 51, passed: false, note: "No entregó la práctica" },
		]);
		expect(log.transactions).toBe(1);
	});

	test("repetir el mismo envío no reescribe nada", async () => {
		const { service, log } = createHarness();
		const dto = { evaluationDocumentId: EVALUATION_DOC, entries };

		await service.saveResults(COURSE_DOC, dto, TRAINER);
		const result = await service.saveResults(COURSE_DOC, dto, TRAINER);

		expect(result).toMatchObject({ success: true, data: { affected: 0 } });
		expect(log.saved).toHaveLength(1);
		expect(log.transactions).toBe(1);
	});

	test("cambiar solo la observación cuenta como cambio", async () => {
		const { service, log } = createHarness();

		await service.saveResults(
			COURSE_DOC,
			{ evaluationDocumentId: EVALUATION_DOC, entries },
			TRAINER,
		);
		const result = await service.saveResults(
			COURSE_DOC,
			{
				evaluationDocumentId: EVALUATION_DOC,
				entries: [
					capture(ANA_DOC, true, "Excelente"),
					capture(LUIS_DOC, false, "No entregó la práctica"),
				],
			},
			TRAINER,
		);

		expect(result).toMatchObject({ success: true, data: { affected: 1 } });
		expect(log.saved[1].writes).toEqual([
			{ userId: 50, passed: true, note: "Excelente" },
		]);
	});

	test("vaciar una captura la borra", async () => {
		const { service, log } = createHarness();

		await service.saveResults(
			COURSE_DOC,
			{ evaluationDocumentId: EVALUATION_DOC, entries },
			TRAINER,
		);
		const result = await service.saveResults(
			COURSE_DOC,
			{
				evaluationDocumentId: EVALUATION_DOC,
				entries: [capture(ANA_DOC, true, null), capture(LUIS_DOC, null, null)],
			},
			TRAINER,
		);

		expect(result).toMatchObject({ success: true, data: { affected: 1 } });
		expect(log.saved[1]).toEqual({ writes: [], deletes: [51] });
	});

	test("alguien que ya no está inscrito rechaza el envío entero", async () => {
		const { service, log } = createHarness({
			target: targetOf({ participants: [] }),
		});

		const result = await service.saveResults(
			COURSE_DOC,
			{ evaluationDocumentId: EVALUATION_DOC, entries },
			TRAINER,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.UNKNOWN_PARTICIPANT },
		});
		expect(log.saved).toEqual([]);
	});

	test("un curso finalizado solo lo corrige la organizadora", async () => {
		const { service, log } = createHarness({ status: "FINISHED" });

		const result = await service.saveResults(
			COURSE_DOC,
			{ evaluationDocumentId: EVALUATION_DOC, entries },
			TRAINER,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: EVALUATION_ERROR_CODES.FORBIDDEN },
		});
		expect(log.saved).toEqual([]);
	});
});

describe("findCourseBoard", () => {
	test("el tablero dice si quien mira puede escribir", async () => {
		const open = createHarness();
		const finished = createHarness({ status: "FINISHED" });

		const writable = await open.service.findCourseBoard(COURSE_DOC, TRAINER);
		const readOnly = await finished.service.findCourseBoard(
			COURSE_DOC,
			TRAINER,
		);

		expect(writable).toMatchObject({
			success: true,
			data: { canWrite: true, evaluations: [] },
		});
		expect(readOnly).toMatchObject({
			success: true,
			data: { canWrite: false },
		});
	});
});
