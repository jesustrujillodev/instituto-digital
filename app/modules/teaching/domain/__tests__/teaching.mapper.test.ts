import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { resolveTeachingScope } from "../teaching.access";
import { toTeachingCourse, toTeachingDetail } from "../teaching.mapper";
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

		const detail = toTeachingDetail(course, scope, LAST_DAY);

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
		});
	});

	test("el capacitador ve un curso finalizado en solo lectura", () => {
		const detail = toTeachingDetail(
			courseOf({ status: "FINISHED" }),
			scope,
			LAST_DAY,
		);

		expect(detail.can.recordAttendance).toBe(false);
		expect(detail.can.correct).toBe(false);
		expect(detail.finishBlocker).toBe("NOT_PUBLISHED");
	});
});

describe("toTeachingCourse", () => {
	test("aplana la inscripción y distingue al externo", () => {
		const course = toTeachingCourse({
			id: 10,
			documentId: "c",
			title: "Curso",
			dependencyId: 3,
			dependency: { name: "Obras Públicas" },
			modality: "ONLINE",
			status: "PUBLISHED",
			minAttendance: 80,
			requiresEvaluation: false,
			finishedAt: null,
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
					user: {
						id: 7,
						documentId: "u",
						firstName: "Elena",
						lastName: null,
						email: "elena@universidad.mx",
						type: "EXTERNAL",
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
