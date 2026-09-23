import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { resolveTeachingScope } from "../teaching.access";
import {
	toTeachingCourse,
	toTeachingCourseSummary,
	toTeachingDetail,
} from "../teaching.mapper";
import {
	actorOf,
	attendanceOf,
	courseOf,
	participantOf,
	SESSION_DOCS,
} from "./teaching.fixtures";

const LAST_DAY = zonedInputToUtc("2026-09-03", "10:00");

describe("toTeachingDetail", () => {
	const scope = resolveTeachingScope(actorOf());

	test("no expone ids internos y marca las sesiones sin lista como null", () => {
		const base = courseOf();
		const course = courseOf({
			participants: [
				participantOf({
					attendance: [{ sessionId: base.sessions[0].id, attended: true }],
				}),
			],
		});

		const detail = toTeachingDetail(course, scope, LAST_DAY, false);

		expect(JSON.stringify(detail)).not.toContain('"id":');
		expect(detail.participants[0].marks).toEqual({
			[SESSION_DOCS[0]]: true,
			[SESSION_DOCS[1]]: null,
			[SESSION_DOCS[2]]: null,
		});
		expect(detail.sessions[0].recorded).toBe(1);
	});

	test("calcula avance y lo que daría el cierre", () => {
		const base = courseOf();
		const detail = toTeachingDetail(
			courseOf({
				participants: [
					participantOf({ attendance: attendanceOf(base, [0, 1, 2]) }),
				],
			}),
			scope,
			LAST_DAY,
			false,
		);

		expect(detail.participants[0]).toMatchObject({
			attendedSessions: 3,
			attendancePercent: 100,
			wouldComplete: true,
			completed: false,
		});
		expect(detail.can).toEqual({
			recordAttendance: true,
			recordResults: false,
			finish: true,
			correct: false,
			toggleEnrollment: false,
			editCourse: false,
			issueCertificates: false,
		});
	});

	// Lo completado antes de F-09 no tiene certificado: quien corrige lo emite.
	test("cuenta a quien completó sin certificado y deja emitirlo a quien corrige", () => {
		const course = courseOf({
			status: "FINISHED",
			participants: [
				participantOf({ completed: true }),
				participantOf({
					userId: 51,
					completed: true,
					certificate: {
						documentId: "d0000000-0000-4000-8000-000000000000",
						folio: "2026-0001",
						revoked: false,
					},
				}),
				participantOf({ userId: 52, completed: false }),
			],
		});
		const head = resolveTeachingScope(
			actorOf({ role: "DEPENDENCY_HEAD", isTrainer: false }),
		);

		const detail = toTeachingDetail(course, head, LAST_DAY, false);

		expect(detail.pendingCertificates).toBe(1);
		expect(detail.can.issueCertificates).toBe(true);
		expect(detail.participants[1].certificate).toMatchObject({
			folio: "2026-0001",
		});
		expect(
			toTeachingDetail(course, scope, LAST_DAY, false).can.issueCertificates,
		).toBe(false);
	});

	test("un curso por impartir no tiene certificados pendientes", () => {
		const detail = toTeachingDetail(
			courseOf({ participants: [participantOf({ completed: true })] }),
			scope,
			LAST_DAY,
			false,
		);

		expect(detail.pendingCertificates).toBe(0);
	});

	test("el capacitador ve un curso finalizado en solo lectura", () => {
		const detail = toTeachingDetail(
			courseOf({ status: "FINISHED" }),
			scope,
			LAST_DAY,
			false,
		);

		expect(detail.can.recordAttendance).toBe(false);
		expect(detail.can.correct).toBe(false);
		expect(detail.finishBlocker).toBe("NOT_PUBLISHED");
	});

	// Impartir no es administrar: el capacitador asignado pasa lista, pero solo
	// quien administra el curso lo edita, y solo mientras se puede editar.
	test("editar el curso exige administrarlo y que siga editable", () => {
		const published = courseOf();
		const finished = courseOf({ status: "FINISHED" });

		expect(
			toTeachingDetail(published, scope, LAST_DAY, true).can.editCourse,
		).toBe(true);
		expect(
			toTeachingDetail(published, scope, LAST_DAY, false).can.editCourse,
		).toBe(false);
		expect(
			toTeachingDetail(finished, scope, LAST_DAY, true).can.editCourse,
		).toBe(false);
	});
});

describe("toTeachingCourse", () => {
	test("aplana la inscripción y distingue al externo", () => {
		const course = toTeachingCourse({
			id: 10,
			documentId: "c",
			title: "Curso",
			dependencyId: 3,
			createdById: 2,
			dependency: { name: "Obras Públicas" },
			modality: "ONLINE",
			format: "SCHEDULED",
			completionRule: "ATTENDANCE",
			status: "PUBLISHED",
			minAttendance: 80,
			requiresEvaluation: false,
			evaluationMethod: "MANUAL",
			finishedAt: null,
			enrollmentClosedAt: null,
			qrToken: null,
			qrTokenRotatedAt: null,
			qrOpensBeforeMinutes: 15,
			qrClosesAfterMinutes: 15,
			sessions: [],
			trainers: [],
			enrollments: [
				{
					result: "PENDING",
					grade: null,
					completed: false,
					progressPercent: 0,
					contentCompletedAt: null,
					user: {
						id: 7,
						documentId: "u",
						firstName: "Elena",
						lastName: null,
						email: "elena@universidad.mx",
						type: "EXTERNAL",
						certificates: [],
						dependencyId: null,
						dependency: null,
						attendance: [{ sessionId: 1, attended: true }],
					},
				},
			],
		});

		expect(course.participants[0]).toMatchObject({
			userId: 7,
			isInternal: false,
			currentDependencyId: null,
			attendance: [{ sessionId: 1, attended: true }],
		});
	});
});

describe("toTeachingCourseSummary", () => {
	const raw = {
		documentId: "curso-1",
		title: "Atención ciudadana",
		coverImageUrl: "/api/storage?key=course-covers%2Fa.webp",
		dependency: { name: "Obras Públicas" },
		modality: "IN_PERSON" as const,
		status: "PUBLISHED" as const,
		sessions: [
			{ startsAt: new Date("2026-09-01T16:00:00.000Z") },
			{ startsAt: new Date("2026-09-03T16:00:00.000Z") },
		],
		_count: { enrollments: 12 },
	};

	test("resuelve la portada con el resolutor que recibe", () => {
		const summary = toTeachingCourseSummary(raw, (reference) =>
			reference ? `https://cdn.ejemplo.com/${reference.length}` : null,
		);

		expect(summary.coverUrl).toBe(
			`https://cdn.ejemplo.com/${raw.coverImageUrl.length}`,
		);
		expect(summary).toMatchObject({
			sessionCount: 2,
			firstSessionAt: raw.sessions[0].startsAt,
			lastSessionAt: raw.sessions[1].startsAt,
			enrolledCount: 12,
		});
	});

	test("sin portada guardada la tarjeta recibe null", () => {
		const summary = toTeachingCourseSummary(
			{ ...raw, coverImageUrl: null },
			() => null,
		);

		expect(summary.coverUrl).toBeNull();
	});
});
