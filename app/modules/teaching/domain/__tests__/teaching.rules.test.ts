import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { resolveTeachingScope } from "../teaching.access";
import { TEACHING_ERROR_CODES } from "../teaching.errors";
import {
	assertCertificatesIssuable,
	assertFinishable,
	assertWritable,
	attendancePercent,
	completedParticipantsOf,
	creditCandidatesOf,
	finishBlockerOf,
	finishOpensAt,
	fiscalYearOf,
	isCompleted,
	isSessionOpen,
	issueCandidatesOf,
	meetsAttendance,
	pendingResultsOf,
	resolveAttendanceMarks,
	resolveResultEntries,
	syncsOnWrite,
} from "../teaching.rules";
import {
	ANA_DOC,
	actorOf,
	attendanceOf,
	courseOf,
	LUIS_DOC,
	participantOf,
	sessionOf,
} from "./teaching.fixtures";

const codeOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return null;
};

describe("meetsAttendance", () => {
	test("compara en enteros: 2 de 3 no llega a 67 % y sí a 66 %", () => {
		expect(meetsAttendance(2, 3, 67)).toBe(false);
		expect(meetsAttendance(2, 3, 66)).toBe(true);
	});

	test("un curso de una sola sesión exige de hecho el 100 %", () => {
		expect(meetsAttendance(1, 1, 80)).toBe(true);
		expect(meetsAttendance(0, 1, 1)).toBe(false);
	});

	test("sin sesiones nadie cumple", () => {
		expect(meetsAttendance(0, 0, 0)).toBe(false);
	});
});

describe("attendancePercent", () => {
	test("redondea hacia abajo y vale 0 sin sesiones", () => {
		expect(attendancePercent(2, 3)).toBe(66);
		expect(attendancePercent(0, 0)).toBe(0);
	});
});

describe("isCompleted", () => {
	const base = courseOf();
	const withAttendance = (attended: number[], result = "PENDING" as const) =>
		participantOf({ attendance: attendanceOf(base, attended), result });

	test("sin evaluación basta con la asistencia mínima", () => {
		const course = { ...base, sessionCount: 3, minAttendance: 60 };

		expect(isCompleted(course, withAttendance([0, 1]))).toBe(true);
		expect(isCompleted(course, withAttendance([0]))).toBe(false);
	});

	test("con evaluación exige además el aprobado", () => {
		const course = { ...base, sessionCount: 3, requiresEvaluation: true };

		expect(isCompleted(course, withAttendance([0, 1, 2]))).toBe(false);
		expect(
			isCompleted(
				course,
				participantOf({
					attendance: attendanceOf(base, [0, 1, 2]),
					result: "PASSED",
				}),
			),
		).toBe(true);
	});

	test("una marca de ausencia no cuenta como asistencia", () => {
		const course = { ...base, sessionCount: 3, minAttendance: 100 };

		expect(isCompleted(course, withAttendance([0, 1]))).toBe(false);
	});

	// docs/adr/0014: el contenido se lee de `contentCompletedAt`, y la
	// evaluación solo cuenta si el curso la exige.
	const DONE = new Date("2026-09-02T15:00:00Z");

	test("por contenido completa quien terminó las obligatorias, sin pisar un aula", () => {
		const course = {
			...base,
			completionRule: "CONTENT" as const,
			requiresEvaluation: false,
			sessionCount: 0,
		};

		expect(
			isCompleted(course, participantOf({ contentCompletedAt: DONE })),
		).toBe(true);
		expect(isCompleted(course, participantOf())).toBe(false);
	});

	test("por contenido con evaluación exige además aprobar", () => {
		const course = {
			...base,
			completionRule: "CONTENT" as const,
			requiresEvaluation: true,
			sessionCount: 0,
		};

		expect(
			isCompleted(
				course,
				participantOf({ contentCompletedAt: DONE, result: "PASSED" }),
			),
		).toBe(true);
		expect(
			isCompleted(
				course,
				participantOf({ contentCompletedAt: DONE, result: "FAILED" }),
			),
		).toBe(false);
		expect(isCompleted(course, participantOf({ result: "PASSED" }))).toBe(
			false,
		);
	});

	test("por contenido la asistencia mínima deja de contar", () => {
		const course = {
			...base,
			completionRule: "CONTENT" as const,
			minAttendance: 100,
			sessionCount: 3,
		};

		expect(
			isCompleted(
				course,
				participantOf({ contentCompletedAt: DONE, attendance: [] }),
			),
		).toBe(true);
	});

	const attending = (attended: number[], contentCompletedAt: Date | null) =>
		participantOf({
			attendance: attendanceOf(base, attended),
			contentCompletedAt,
		});

	test("asistencia y contenido piden las dos cosas", () => {
		const course = {
			...base,
			sessionCount: 3,
			completionRule: "BOTH" as const,
		};

		expect(isCompleted(course, attending([0, 1, 2], DONE))).toBe(true);
		expect(isCompleted(course, attending([0, 1, 2], null))).toBe(false);
		expect(isCompleted(course, attending([0], DONE))).toBe(false);
	});

	// La rama de siempre no mira el contenido: un avance guardado no puede
	// cambiar quién completa un curso por asistencia.
	test("por asistencia el contenido no cuenta", () => {
		const course = { ...base, sessionCount: 3 };

		expect(isCompleted(course, attending([0, 1, 2], null))).toBe(true);
		expect(isCompleted(course, attending([0], DONE))).toBe(false);
	});
});

describe("creditCandidatesOf", () => {
	test("un externo o alguien sin dependencia completa pero no suma crédito", () => {
		const course = courseOf({
			participants: [
				participantOf({ attendance: attendanceOf(courseOf(), [0, 1, 2]) }),
				participantOf({
					userId: 51,
					userDocumentId: LUIS_DOC,
					isInternal: false,
					currentDependencyId: null,
					attendance: attendanceOf(courseOf(), [0, 1, 2]),
				}),
			],
		});
		const completed = completedParticipantsOf(course);

		expect(completed).toHaveLength(2);
		expect(creditCandidatesOf(completed)).toEqual([
			{ userId: 50, dependencyId: 3 },
		]);
	});
});

describe("issueCandidatesOf", () => {
	test("todos los que completaron, con el nombre que se imprime", () => {
		const candidates = issueCandidatesOf([
			participantOf(),
			participantOf({
				userId: 51,
				firstName: null,
				lastName: null,
				email: "elena@universidad.mx",
				isInternal: false,
				currentDependencyId: null,
			}),
		]);

		expect(candidates).toEqual([
			{ userId: 50, recipientName: "Ana Ruiz" },
			{ userId: 51, recipientName: "elena@universidad.mx" },
		]);
	});
});

describe("assertCertificatesIssuable", () => {
	test("se emite a demanda en un finalizado o en un autogestivo publicado", () => {
		expect(() =>
			assertCertificatesIssuable({ status: "FINISHED", format: "SCHEDULED" }),
		).not.toThrow();
		expect(() =>
			assertCertificatesIssuable({ status: "PUBLISHED", format: "SELF_PACED" }),
		).not.toThrow();
	});

	test("un curso por impartir espera a su cierre", () => {
		expect(() =>
			assertCertificatesIssuable({ status: "PUBLISHED", format: "SCHEDULED" }),
		).toThrow(
			expect.objectContaining({
				code: TEACHING_ERROR_CODES.CERTIFICATES_NOT_ISSUABLE,
			}),
		);
	});
});

describe("ventanas de cierre", () => {
	test("finalizar se abre a las 00:00 locales del día de la última sesión", () => {
		expect(finishOpensAt(courseOf())).toEqual(
			zonedInputToUtc("2026-09-03", "00:00"),
		);
	});

	test("la lista de una sesión se abre desde el inicio de su día", () => {
		const session = sessionOf(0, "2026-11-20");

		expect(isSessionOpen(session, zonedInputToUtc("2026-11-19", "23:59"))).toBe(
			false,
		);
		expect(isSessionOpen(session, zonedInputToUtc("2026-11-20", "00:00"))).toBe(
			true,
		);
	});

	test("el ejercicio es el año local de la última sesión", () => {
		const course = courseOf({
			sessions: [
				sessionOf(0, "2026-12-31", {
					startsAt: zonedInputToUtc("2026-12-31", "20:00"),
				}),
			],
		});

		expect(fiscalYearOf(course, new Date("2030-01-01"))).toBe(2026);
	});

	// Sin última sesión, el ejercicio sale de la fecha de cierre.
	test("el ejercicio de un autogestivo es el año en que se cierra", () => {
		const course = courseOf({ format: "SELF_PACED", sessions: [] });

		expect(fiscalYearOf(course, zonedInputToUtc("2027-03-18", "10:00"))).toBe(
			2027,
		);
	});
});

describe("finishBlockerOf / assertFinishable", () => {
	const onLastDay = zonedInputToUtc("2026-09-03", "08:00");

	test("un curso publicado, en su día y sin pendientes se puede finalizar", () => {
		expect(finishBlockerOf(courseOf(), onLastDay)).toBeNull();
		expect(() => assertFinishable(courseOf(), onLastDay)).not.toThrow();
	});

	test("cada impedimento tiene su código estable", () => {
		expect(
			codeOf(() =>
				assertFinishable(courseOf({ status: "FINISHED" }), onLastDay),
			),
		).toBe(TEACHING_ERROR_CODES.NOT_PUBLISHED);
		expect(
			codeOf(() => assertFinishable(courseOf({ sessions: [] }), onLastDay)),
		).toBe(TEACHING_ERROR_CODES.WITHOUT_SESSIONS);
		expect(
			codeOf(() =>
				assertFinishable(courseOf(), zonedInputToUtc("2026-09-02", "23:59")),
			),
		).toBe(TEACHING_ERROR_CODES.FINISH_TOO_EARLY);
		expect(
			codeOf(() =>
				assertFinishable(courseOf({ requiresEvaluation: true }), onLastDay),
			),
		).toBe(TEACHING_ERROR_CODES.PENDING_RESULTS);
	});

	// docs/adr/0014: cada participante lo completa; el curso no se cierra.
	test("un autogestivo no se finaliza nunca", () => {
		const course = courseOf({
			format: "SELF_PACED",
			completionRule: "CONTENT",
			sessions: [],
		});

		expect(finishBlockerOf(course, onLastDay)).toBe("SELF_PACED");
		expect(codeOf(() => assertFinishable(course, onLastDay))).toBe(
			TEACHING_ERROR_CODES.SELF_PACED_NOT_FINISHABLE,
		);
	});

	test("sin evaluación, un resultado pendiente no bloquea", () => {
		expect(finishBlockerOf(courseOf(), onLastDay)).toBeNull();
	});
});

describe("assertWritable", () => {
	const trainer = resolveTeachingScope(actorOf());
	const head = resolveTeachingScope(
		actorOf({ role: "DEPENDENCY_HEAD", isTrainer: false }),
	);

	test("un curso publicado lo escribe quien imparte", () => {
		expect(() => assertWritable(courseOf(), trainer)).not.toThrow();
	});

	test("un curso finalizado solo lo corrige la dependencia organizadora", () => {
		const finished = courseOf({ status: "FINISHED" });

		expect(codeOf(() => assertWritable(finished, trainer))).toBe(
			TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN,
		);
		expect(() => assertWritable(finished, head)).not.toThrow();
	});

	test("un borrador o un cancelado se ve como inexistente", () => {
		expect(
			codeOf(() => assertWritable(courseOf({ status: "DRAFT" }), head)),
		).toBe(TEACHING_ERROR_CODES.COURSE_NOT_FOUND);
	});
});

describe("resolveAttendanceMarks", () => {
	const session = courseOf().sessions[0];

	test("solo devuelve las marcas que cambian algo", () => {
		const course = courseOf({
			participants: [
				participantOf({
					attendance: [{ sessionId: session.id, attended: true }],
				}),
				participantOf({ userId: 51, userDocumentId: LUIS_DOC }),
			],
		});

		expect(
			resolveAttendanceMarks(course, session.id, [
				{ userDocumentId: ANA_DOC, attended: true },
				{ userDocumentId: LUIS_DOC, attended: false },
			]),
		).toEqual([{ userId: 51, attended: false }]);
	});

	test("rechaza el envío entero si alguien no está inscrito", () => {
		expect(
			codeOf(() =>
				resolveAttendanceMarks(courseOf(), session.id, [
					{ userDocumentId: LUIS_DOC, attended: true },
				]),
			),
		).toBe(TEACHING_ERROR_CODES.UNKNOWN_PARTICIPANT);
	});
});

describe("resolveResultEntries", () => {
	const evaluated = courseOf({ requiresEvaluation: true });

	test("sin evaluación no se capturan resultados", () => {
		expect(
			codeOf(() =>
				resolveResultEntries(courseOf(), [
					{ userDocumentId: ANA_DOC, result: "PASSED", grade: null },
				]),
			),
		).toBe(TEACHING_ERROR_CODES.EVALUATION_NOT_REQUIRED);
	});

	test("un cambio de nota cuenta como cambio", () => {
		const course = {
			...evaluated,
			participants: [participantOf({ result: "PASSED", grade: 80 })],
		};

		expect(
			resolveResultEntries(course, [
				{ userDocumentId: ANA_DOC, result: "PASSED", grade: 80 },
			]),
		).toEqual([]);
		expect(
			resolveResultEntries(course, [
				{ userDocumentId: ANA_DOC, result: "PASSED", grade: 90 },
			]),
		).toEqual([{ userId: 50, result: "PASSED", grade: 90 }]);
	});

	test("un curso finalizado no vuelve a pendiente", () => {
		expect(
			codeOf(() =>
				resolveResultEntries({ ...evaluated, status: "FINISHED" }, [
					{ userDocumentId: ANA_DOC, result: "PENDING", grade: null },
				]),
			),
		).toBe(TEACHING_ERROR_CODES.PENDING_RESULTS);
	});
});

describe("syncsOnWrite", () => {
	test.each([
		[
			"un calendarizado publicado espera a su cierre",
			"SCHEDULED",
			"PUBLISHED",
			false,
		],
		[
			"un calendarizado finalizado se corrige en el acto",
			"SCHEDULED",
			"FINISHED",
			true,
		],
		[
			"un autogestivo publicado completa en vivo",
			"SELF_PACED",
			"PUBLISHED",
			true,
		],
	] as const)("%s", (_, format, status, expected) => {
		expect(syncsOnWrite({ format, status })).toBe(expected);
	});
});

describe("pendingResultsOf con examen en línea", () => {
	test("un pendiente no cuenta: nadie lo captura a mano", () => {
		const pending = participantOf();

		expect(
			pendingResultsOf(
				courseOf({
					requiresEvaluation: true,
					evaluationMethod: "QUIZ",
					participants: [pending],
				}),
			),
		).toBe(0);
		expect(
			pendingResultsOf(
				courseOf({ requiresEvaluation: true, participants: [pending] }),
			),
		).toBe(1);
	});
});
