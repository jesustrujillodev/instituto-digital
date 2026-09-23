import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CreditCandidate,
	CreditWriteContext,
	StoredCredit,
} from "@/modules/credits/domain/credit.types";
import type { ResultWrite } from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	ANA_DOC,
	actorOf,
	attendanceOf,
	COURSE_DOC,
	courseOf,
	LUIS_DOC,
	participantOf,
	SESSION_DOCS,
} from "../../domain/__tests__/teaching.fixtures";
import { TEACHING_ERROR_CODES } from "../../domain/teaching.errors";
import type {
	AttendanceMark,
	TeachingCourse,
} from "../../domain/teaching.types";
import { createCompletionSync } from "../completion-sync.server";
import { createTeachingService } from "../teaching.service.server";

const LAST_DAY = zonedInputToUtc("2026-09-03", "10:00");

const SELF_PACED_COURSE = (overrides: Partial<TeachingCourse> = {}) =>
	courseOf({
		format: "SELF_PACED",
		completionRule: "CONTENT",
		sessions: [],
		...overrides,
	});

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const HEAD = actorOf({ userId: 2, role: "DEPENDENCY_HEAD", isTrainer: false });

/**
 * Dobles en memoria: la escritura cambia lo que la siguiente lectura devuelve,
 * que es lo que necesita probar que la corrección recalcula sobre lo guardado.
 */
const createHarness = (
	initial: TeachingCourse = courseOf(),
	options: { credits?: StoredCredit[]; finishWins?: boolean; now?: Date } = {},
) => {
	const course = structuredClone(initial);
	let credits = structuredClone(options.credits ?? []);
	let inTransaction = false;
	const log = {
		locks: [] as boolean[],
		attendance: [] as AttendanceMark[][],
		results: [] as ResultWrite[][],
		completion: [] as number[][],
		grants: [] as {
			candidates: CreditCandidate[];
			context: CreditWriteContext;
		}[],
		finishes: 0,
		markedFailed: 0,
		enrollmentClosed: [] as (Date | null)[],
		issued: [] as number[][],
	};

	const participantById = (userId: number) => {
		const participant = course.participants.find(
			(row) => row.userId === userId,
		);
		if (!participant) throw new Error(`sin participante ${userId}`);
		return participant;
	};

	const teachingRepository = {
		findCourse: async (documentId: string, where: object) =>
			documentId === course.documentId && !("id" in where)
				? structuredClone(course)
				: null,
		findCourseById: async () => structuredClone(course),
		saveAttendance: async (sessionId: number, marks: AttendanceMark[]) => {
			log.attendance.push(marks);
			for (const mark of marks) {
				const participant = participantById(mark.userId);
				participant.attendance = [
					...participant.attendance.filter(
						(row) => row.sessionId !== sessionId,
					),
					{ sessionId, attended: mark.attended },
				];
			}
		},
	} as unknown as ICradle["teachingRepository"];

	const enrollmentRepository = {
		lockCourseSeats: async () => {
			log.locks.push(inTransaction);
			return { capacity: null, enrolled: 0 };
		},
		saveResults: async (_courseId: number, entries: ResultWrite[]) => {
			log.results.push(entries);
			for (const entry of entries) {
				Object.assign(participantById(entry.userId), {
					result: entry.result,
					grade: entry.grade,
				});
			}
		},
		markPendingAsFailed: async () => {
			log.markedFailed += 1;
			for (const participant of course.participants) {
				if (participant.result === "PENDING") participant.result = "FAILED";
			}
		},
		setCompletion: async (_courseId: number, userIds: number[]) => {
			log.completion.push([...userIds]);
			for (const participant of course.participants) {
				participant.completed = userIds.includes(participant.userId);
			}
		},
	} as unknown as ICradle["enrollmentRepository"];

	const courseRepository = {
		finish: async () => {
			log.finishes += 1;
			if (options.finishWins === false) return false;
			course.status = "FINISHED";
			return true;
		},
		setEnrollmentClosed: async (_courseId: number, at: Date | null) => {
			log.enrollmentClosed.push(at);
			course.enrollmentClosedAt = at;
		},
	} as unknown as ICradle["courseRepository"];

	const creditRepository = {
		findByCourse: async () => structuredClone(credits),
		grant: async (
			candidates: CreditCandidate[],
			context: CreditWriteContext,
		) => {
			if (candidates.length > 0) log.grants.push({ candidates, context });
			credits = [
				...credits,
				...candidates.map((candidate) => ({ ...candidate, revokedAt: null })),
			];
		},
		restore: async (userIds: number[]) => {
			credits = credits.map((credit) =>
				userIds.includes(credit.userId)
					? { ...credit, revokedAt: null }
					: credit,
			);
		},
		revoke: async (userIds: number[], context: { at: Date }) => {
			credits = credits.map((credit) =>
				userIds.includes(credit.userId)
					? { ...credit, revokedAt: context.at }
					: credit,
			);
		},
	} as unknown as ICradle["creditRepository"];

	const runInTransaction = (async <T>(work: () => Promise<T>) => {
		inTransaction = true;
		try {
			return await work();
		} finally {
			inTransaction = false;
		}
	}) as unknown as ICradle["runInTransaction"];

	// La real sobre los mismos dobles: estas pruebas miden que el cierre y la
	// corrección dejan los créditos como el cálculo, no que llamen a una función.
	const completionSync = createCompletionSync({
		teachingRepository,
		enrollmentRepository,
		creditRepository,
		certificateIssuance: {
			sync: async (
				_courseId: number,
				completed: readonly { userId: number }[],
			) => {
				log.issued.push(completed.map((candidate) => candidate.userId));
				return { issued: completed.length, restored: 0, revoked: 0 };
			},
		} as unknown as ICradle["certificateIssuance"],
	});

	const service = createTeachingService({
		teachingRepository,
		courseRepository,
		enrollmentRepository,
		completionSync,
		runInTransaction,
		clock: { now: () => options.now ?? LAST_DAY },
		logger: silentLogger,
	});

	return {
		service,
		log,
		course: () => course,
		credits: () => credits,
	};
};

const attend = (
	service: ReturnType<typeof createHarness>["service"],
	sessionIndex: number,
	marks: Record<string, boolean>,
	actor: AuthContext = actorOf(),
) =>
	service.saveAttendance(
		COURSE_DOC,
		{
			sessionDocumentId: SESSION_DOCS[sessionIndex],
			marks: Object.entries(marks).map(([userDocumentId, attended]) => ({
				userDocumentId,
				attended,
			})),
		},
		actor,
	);

describe("teachingService.saveAttendance", () => {
	test("guarda dentro de la transacción, con la fila del curso bloqueada", async () => {
		const { service, log } = createHarness();

		const result = await attend(service, 0, { [ANA_DOC]: true });

		expect(result).toMatchObject({ success: true, data: { affected: 1 } });
		expect(log.locks).toEqual([true]);
		expect(log.attendance).toEqual([[{ userId: 50, attended: true }]]);
	});

	test("una lista igual a la guardada no reescribe nada", async () => {
		const base = courseOf();
		const { service, log } = createHarness(
			courseOf({
				participants: [
					participantOf({
						attendance: [{ sessionId: base.sessions[0].id, attended: true }],
					}),
				],
			}),
		);

		const result = await attend(service, 0, { [ANA_DOC]: true });

		expect(result).toMatchObject({ success: true, data: { affected: 0 } });
		expect(log.attendance).toEqual([]);
	});

	test("antes del día de la sesión no se pasa lista", async () => {
		const { service } = createHarness(courseOf(), {
			now: zonedInputToUtc("2026-09-01", "10:00"),
		});

		const result = await attend(service, 2, { [ANA_DOC]: true });

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.SESSION_NOT_STARTED },
		});
	});

	test("quien no imparte ni organiza no llega a leer el curso", async () => {
		const { service, log } = createHarness();

		const result = await attend(
			service,
			0,
			{ [ANA_DOC]: true },
			actorOf({ isTrainer: false }),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.FORBIDDEN_SCOPE },
		});
		expect(log.locks).toEqual([]);
	});

	test("en un curso publicado no toca créditos", async () => {
		const { service, log } = createHarness();

		await attend(service, 0, { [ANA_DOC]: true });

		expect(log.completion).toEqual([]);
		expect(log.grants).toEqual([]);
	});
});

describe("teachingService.saveResults", () => {
	const evaluated = courseOf({ requiresEvaluation: true });

	test("guarda solo lo que cambia", async () => {
		const { service, log } = createHarness(evaluated);

		const result = await service.saveResults(
			COURSE_DOC,
			{ entries: [{ userDocumentId: ANA_DOC, result: "PASSED", grade: 92 }] },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: { affected: 1 } });
		expect(log.results).toEqual([
			[{ userId: 50, result: "PASSED", grade: 92 }],
		]);
	});

	test("rechaza el envío si alguien no está inscrito", async () => {
		const { service, log } = createHarness(evaluated);

		const result = await service.saveResults(
			COURSE_DOC,
			{
				entries: [{ userDocumentId: LUIS_DOC, result: "PASSED", grade: null }],
			},
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.UNKNOWN_PARTICIPANT },
		});
		expect(log.results).toEqual([]);
	});
});

describe("teachingService.finish", () => {
	const completedCourse = () => {
		const base = courseOf();
		return courseOf({
			participants: [
				participantOf({ attendance: attendanceOf(base, [0, 1, 2]) }),
				participantOf({
					userId: 51,
					userDocumentId: LUIS_DOC,
					currentDependencyId: 4,
					attendance: attendanceOf(base, [0]),
				}),
			],
		});
	};

	test("marca FINISHED, calcula quién completó y otorga su crédito", async () => {
		const { service, log, course, credits } = createHarness(completedCourse());

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: true,
			data: { completed: 1, credits: 1, certificates: 1 },
		});
		expect(course().status).toBe("FINISHED");
		expect(log.issued).toEqual([[50]]);
		expect(log.locks).toEqual([true]);
		expect(log.completion).toEqual([[50]]);
		expect(log.grants).toEqual([
			{
				candidates: [{ userId: 50, dependencyId: 3 }],
				context: { courseId: 10, fiscalYear: 2026, at: LAST_DAY, actorId: 9 },
			},
		]);
		expect(credits()).toEqual([
			{ userId: 50, dependencyId: 3, revokedAt: null },
		]);
	});

	// docs/adr/0014: cada participante lo completa; el curso no se cierra.
	test("un autogestivo no se finaliza", async () => {
		const { service, log } = createHarness(SELF_PACED_COURSE());

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.SELF_PACED_NOT_FINISHABLE },
		});
		expect(log.finishes).toBe(0);
	});

	test("con resultados pendientes no finaliza ni otorga nada", async () => {
		const { service, log } = createHarness(
			courseOf({ requiresEvaluation: true }),
		);

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: {
				code: TEACHING_ERROR_CODES.PENDING_RESULTS,
				details: { pending: 1 },
			},
		});
		expect(log.finishes).toBe(0);
		expect(log.grants).toEqual([]);
	});

	test("antes del día de la última sesión no se puede finalizar", async () => {
		const { service } = createHarness(courseOf(), {
			now: zonedInputToUtc("2026-09-02", "23:00"),
		});

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.FINISH_TOO_EARLY },
		});
	});

	test("si otra petición lo finalizó antes, responde STATE_CHANGED", async () => {
		const { service, log } = createHarness(completedCourse(), {
			finishWins: false,
		});

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.STATE_CHANGED },
		});
		expect(log.grants).toEqual([]);
	});
});

describe("corrección de un curso finalizado", () => {
	const finishedWithCredit = () => {
		const base = courseOf();
		return createHarness(
			courseOf({
				status: "FINISHED",
				participants: [
					participantOf({
						completed: true,
						attendance: attendanceOf(base, [0, 1, 2]),
					}),
				],
			}),
			{ credits: [{ userId: 50, dependencyId: 3, revokedAt: null }] },
		);
	};

	test("el titular retira asistencia y el crédito se retira sin borrarse", async () => {
		const harness = finishedWithCredit();

		const result = await attend(harness.service, 1, { [ANA_DOC]: false }, HEAD);

		expect(result.success).toBe(true);
		expect(harness.log.completion).toEqual([[]]);
		expect(harness.credits()).toEqual([
			{ userId: 50, dependencyId: 3, revokedAt: LAST_DAY },
		]);
	});

	test("devolver la asistencia restaura el mismo crédito", async () => {
		const harness = finishedWithCredit();

		await attend(harness.service, 1, { [ANA_DOC]: false }, HEAD);
		await attend(harness.service, 1, { [ANA_DOC]: true }, HEAD);

		expect(harness.credits()).toEqual([
			{ userId: 50, dependencyId: 3, revokedAt: null },
		]);
		expect(harness.log.grants).toEqual([]);
	});

	test("el capacitador no corrige un curso finalizado", async () => {
		const harness = finishedWithCredit();

		const result = await attend(harness.service, 1, { [ANA_DOC]: false });

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN },
		});
		expect(harness.credits()[0].revokedAt).toBeNull();
	});

	test("corregir un resultado a no aprobado retira el crédito", async () => {
		const base = courseOf();
		const harness = createHarness(
			courseOf({
				status: "FINISHED",
				requiresEvaluation: true,
				participants: [
					participantOf({
						result: "PASSED",
						completed: true,
						attendance: attendanceOf(base, [0, 1, 2]),
					}),
				],
			}),
			{ credits: [{ userId: 50, dependencyId: 3, revokedAt: null }] },
		);

		const result = await harness.service.saveResults(
			COURSE_DOC,
			{ entries: [{ userDocumentId: ANA_DOC, result: "FAILED", grade: 40 }] },
			HEAD,
		);

		expect(result.success).toBe(true);
		expect(harness.credits()[0].revokedAt).toEqual(LAST_DAY);
	});
});

describe("teachingService.issueCertificates", () => {
	const finishedBeforeCertificates = () => {
		const base = courseOf();
		return courseOf({
			status: "FINISHED",
			participants: [
				participantOf({
					completed: true,
					attendance: attendanceOf(base, [0, 1, 2]),
				}),
			],
		});
	};

	test("sincroniza en una transacción y emite a quien completó", async () => {
		const { service, log } = createHarness(finishedBeforeCertificates());

		const result = await service.issueCertificates(COURSE_DOC, HEAD);

		expect(result).toMatchObject({ success: true, data: { issued: 1 } });
		expect(log.locks).toEqual([true]);
		expect(log.issued).toEqual([[50]]);
	});

	test("un curso por impartir no emite a demanda", async () => {
		const { service, log } = createHarness(courseOf());

		const result = await service.issueCertificates(COURSE_DOC, HEAD);

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.CERTIFICATES_NOT_ISSUABLE },
		});
		expect(log.issued).toEqual([]);
	});

	test("en un finalizado solo emite quien puede corregirlo", async () => {
		const { service, log } = createHarness(finishedBeforeCertificates());

		const result = await service.issueCertificates(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN },
		});
		expect(log.issued).toEqual([]);
	});
});

describe("teachingService.findById", () => {
	test("un curso fuera del alcance responde COURSE_NOT_FOUND", async () => {
		const { service } = createHarness();

		const result = await service.findById(
			"44444444-4444-4444-8444-444444444444",
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});
});

describe("autogestivo: completado en vivo", () => {
	const DONE = zonedInputToUtc("2027-03-10", "12:00");

	// Sin cierre, el último dato que falte es el que otorga el crédito: aquí el
	// resultado llega después del contenido.
	test("capturar el resultado otorga el crédito en ese momento", async () => {
		const { service, log, course, credits } = createHarness(
			SELF_PACED_COURSE({
				requiresEvaluation: true,
				participants: [participantOf({ contentCompletedAt: DONE })],
			}),
			{ now: zonedInputToUtc("2027-03-18", "10:00") },
		);

		const result = await service.saveResults(
			COURSE_DOC,
			{ entries: [{ userDocumentId: ANA_DOC, result: "PASSED", grade: 90 }] },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: { affected: 1 } });
		expect(course().status).toBe("PUBLISHED");
		expect(course().participants[0]?.completed).toBe(true);
		expect(log.grants[0]?.context).toMatchObject({ fiscalYear: 2027 });
		expect(credits()).toEqual([
			{ userId: 50, dependencyId: 3, revokedAt: null },
		]);
	});

	test("aprobar sin haber terminado el contenido no otorga nada", async () => {
		const { service, log } = createHarness(
			SELF_PACED_COURSE({
				requiresEvaluation: true,
				participants: [participantOf()],
			}),
		);

		await service.saveResults(
			COURSE_DOC,
			{ entries: [{ userDocumentId: ANA_DOC, result: "PASSED", grade: null }] },
			actorOf(),
		);

		expect(log.grants).toEqual([]);
	});

	test("un calendarizado publicado no recalcula al capturar", async () => {
		const { service, log } = createHarness(
			courseOf({ requiresEvaluation: true }),
		);

		await service.saveResults(
			COURSE_DOC,
			{ entries: [{ userDocumentId: ANA_DOC, result: "PASSED", grade: null }] },
			actorOf(),
		);

		expect(log.completion).toEqual([]);
	});
});

describe("teachingService.setEnrollmentOpen", () => {
	test("cierra y reabre las inscripciones de un autogestivo", async () => {
		const { service, log, course } = createHarness(SELF_PACED_COURSE());

		const closed = await service.setEnrollmentOpen(
			COURSE_DOC,
			{ open: false },
			actorOf(),
		);

		expect(closed).toMatchObject({ success: true, data: { affected: 1 } });
		expect(course().enrollmentClosedAt).toEqual(LAST_DAY);
		expect(log.locks).toEqual([true]);

		const reopened = await service.setEnrollmentOpen(
			COURSE_DOC,
			{ open: true },
			actorOf(),
		);

		expect(reopened).toMatchObject({ success: true, data: { affected: 1 } });
		expect(course().enrollmentClosedAt).toBeNull();
	});

	test("pedir el estado que ya tiene no escribe", async () => {
		const { service, log } = createHarness(SELF_PACED_COURSE());

		const result = await service.setEnrollmentOpen(
			COURSE_DOC,
			{ open: true },
			actorOf(),
		);

		expect(result).toMatchObject({ success: true, data: { affected: 0 } });
		expect(log.enrollmentClosed).toEqual([]);
	});

	test("un curso con sesiones no se abre ni se cierra a mano", async () => {
		const { service, log } = createHarness();

		const result = await service.setEnrollmentOpen(
			COURSE_DOC,
			{ open: false },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.NOT_SELF_PACED },
		});
		expect(log.enrollmentClosed).toEqual([]);
	});
});

// docs/adr/0015: con examen en línea el resultado lo escribe el examen.
describe("curso evaluado con examen en línea", () => {
	const quizCourse = () =>
		courseOf({ requiresEvaluation: true, evaluationMethod: "QUIZ" });

	test("no admite captura manual de resultados", async () => {
		const { service, log } = createHarness(quizCourse());

		const result = await service.saveResults(
			COURSE_DOC,
			{ entries: [{ userDocumentId: ANA_DOC, result: "PASSED", grade: 90 }] },
			actorOf(),
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.RESULTS_BY_QUIZ },
		});
		expect(log.results).toEqual([]);
	});

	test("un pendiente no bloquea el cierre y queda como «No presentó»", async () => {
		const { service, log, course } = createHarness(quizCourse());

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result.success).toBe(true);
		expect(log.markedFailed).toBe(1);
		expect(course().participants[0]?.result).toBe("FAILED");
	});

	test("con captura manual, el pendiente sigue bloqueando como siempre", async () => {
		const { service, log } = createHarness(
			courseOf({ requiresEvaluation: true }),
		);

		const result = await service.finish(COURSE_DOC, actorOf());

		expect(result).toMatchObject({
			success: false,
			error: { code: TEACHING_ERROR_CODES.PENDING_RESULTS },
		});
		expect(log.markedFailed).toBe(0);
	});
});
