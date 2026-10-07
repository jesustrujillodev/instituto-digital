import { describe, expect, test } from "vitest";
import type { EnrollmentStatus } from "../enrollment.config";
import type { EnrollmentCourse, MyCourseRecord } from "../enrollment.types";
import {
	attendanceOutlookOf,
	bucketMyCourses,
	toMyCoursesDigest,
} from "../my-courses.rules";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const LIMITS = { invitations: 5, inProgress: 5, upcoming: 3, toRate: 3 };

const session = (documentId: string, startsAt: string, endsAt: string) => ({
	documentId,
	startsAt: new Date(startsAt),
	endsAt: new Date(endsAt),
	venue: "Sala",
	link: null,
});

const courseOf = (
	overrides: Partial<EnrollmentCourse> = {},
): EnrollmentCourse => ({
	id: 7,
	documentId: `c-${overrides.title ?? "curso"}`,
	dependencyName: "SEDESOL",
	title: "Atención ciudadana",
	description: null,
	hours: null,
	coverUrl: null,
	modality: "IN_PERSON",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	minAttendance: 80,
	requiresEvaluation: false,
	minPassingGrade: 70,
	access: "PUBLIC",
	status: "PUBLISHED",
	capacity: null,
	enrolledCount: 0,
	enrollmentDeadline: null,
	enrollmentClosedAt: null,
	finishedAt: null,
	sessions: [
		session("s1", "2026-10-20T23:00:00.000Z", "2026-10-21T02:00:00.000Z"),
	],
	trainers: [],
	firstSessionAt: new Date("2026-10-20T23:00:00.000Z"),
	lastSessionEndsAt: new Date("2026-10-21T02:00:00.000Z"),
	...overrides,
});

const recordOf = (
	status: EnrollmentStatus,
	course: Partial<EnrollmentCourse>,
	outcome: Partial<MyCourseRecord["outcome"]> = {},
): MyCourseRecord => ({
	enrollment: {
		documentId: `e-${course.title}`,
		origin: "SELF",
		status,
		result: "PENDING",
		removed: false,
		withdrawnAt: null,
	},
	course: courseOf(course),
	outcome: {
		grade: null,
		completed: false,
		progressPercent: 0,
		contentCompletedAt: null,
		attendedSessions: 0,
		myRating: null,
		certificate: null,
		...outcome,
	},
});

const inProgressCourse = {
	sessions: [
		session("s1", "2026-09-10T16:00:00.000Z", "2026-09-10T18:00:00.000Z"),
		session("s2", "2026-09-14T16:00:00.000Z", "2026-09-14T18:00:00.000Z"),
		session("s3", "2026-09-17T16:00:00.000Z", "2026-09-17T18:00:00.000Z"),
		session("s4", "2026-09-21T16:00:00.000Z", "2026-09-21T18:00:00.000Z"),
		session("s5", "2026-09-24T16:00:00.000Z", "2026-09-24T18:00:00.000Z"),
	],
	firstSessionAt: new Date("2026-09-10T16:00:00.000Z"),
	lastSessionEndsAt: new Date("2026-09-24T18:00:00.000Z"),
};

describe("bucketMyCourses", () => {
	test("reparte por estado de la inscripción y momento del curso", () => {
		const mine = bucketMyCourses(
			[
				recordOf("INVITED", { title: "invitación" }),
				recordOf("INVITED", {
					title: "invitación cancelada",
					status: "CANCELLED",
				}),
				recordOf("WITHDRAWN", { title: "baja" }),
				recordOf("ENROLLED", { title: "próximo" }),
				recordOf("ENROLLED", { ...inProgressCourse, title: "en curso" }),
				recordOf("ENROLLED", { title: "cerrado", status: "FINISHED" }),
			],
			NOW,
		);

		const titles = (key: keyof typeof mine) =>
			mine[key].map((entry) => entry.course.title);
		expect(titles("invitations")).toEqual(["invitación"]);
		expect(titles("withdrawn")).toEqual(["baja"]);
		expect(titles("upcoming")).toEqual(["próximo"]);
		expect(titles("inProgress")).toEqual(["en curso"]);
		expect(titles("finished")).toEqual(["cerrado"]);
	});
});

describe("attendanceOutlookOf", () => {
	test("con 80 % de 5 sesiones hacen falta 4", () => {
		expect(attendanceOutlookOf(1, 2, 5, 80)).toEqual({
			attended: 1,
			needed: 3,
			remaining: 3,
			reachable: true,
		});
	});

	test("deja de ser alcanzable cuando no quedan sesiones suficientes", () => {
		expect(attendanceOutlookOf(0, 3, 5, 80)).toMatchObject({
			needed: 4,
			remaining: 2,
			reachable: false,
		});
	});

	test("usa la misma comparación entera que el cálculo del crédito", () => {
		expect(attendanceOutlookOf(2, 3, 3, 67).needed).toBe(1);
		expect(attendanceOutlookOf(2, 3, 3, 66).needed).toBe(0);
	});
});

describe("toMyCoursesDigest", () => {
	test("ordena las invitaciones por cierre y marca las que vencen pronto", () => {
		const mine = bucketMyCourses(
			[
				recordOf("INVITED", {
					title: "lejana",
					enrollmentDeadline: new Date("2026-10-15T07:00:00.000Z"),
				}),
				recordOf("INVITED", {
					title: "urgente",
					enrollmentDeadline: new Date("2026-09-18T07:00:00.000Z"),
				}),
			],
			NOW,
		);

		const digest = toMyCoursesDigest(mine, NOW, LIMITS);

		expect(digest.invitations.map((item) => item.title)).toEqual([
			"urgente",
			"lejana",
		]);
		expect(digest.invitations.map((item) => item.closesSoon)).toEqual([
			true,
			false,
		]);
	});

	test("en curso lleva su avance y cuánta asistencia le falta", () => {
		const mine = bucketMyCourses(
			[
				recordOf(
					"ENROLLED",
					{ ...inProgressCourse, title: "en curso" },
					{ attendedSessions: 2, progressPercent: 40 },
				),
			],
			NOW,
		);

		const [course] = toMyCoursesDigest(mine, NOW, LIMITS).inProgress;

		expect(course).toMatchObject({
			title: "en curso",
			progressPercent: 40,
			sessionCount: 5,
			nextSession: { documentId: "s3" },
			attendance: { attended: 2, needed: 2, remaining: 3, reachable: true },
		});
	});

	test("sin asistencia en la regla, no hay pronóstico de asistencia", () => {
		const mine = bucketMyCourses(
			[
				recordOf("ENROLLED", {
					title: "a tu ritmo",
					format: "SELF_PACED",
					completionRule: "CONTENT",
					sessions: [],
					firstSessionAt: null,
					lastSessionEndsAt: null,
				}),
			],
			NOW,
		);

		expect(toMyCoursesDigest(mine, NOW, LIMITS).inProgress[0].attendance).toBe(
			null,
		);
	});

	test("por valorar sale de lo que la regla de valoración permite", () => {
		const mine = bucketMyCourses(
			[
				recordOf(
					"ENROLLED",
					{ title: "asistió", status: "FINISHED" },
					{ attendedSessions: 1 },
				),
				recordOf(
					"ENROLLED",
					{ title: "ya valoró", status: "FINISHED" },
					{ attendedSessions: 1, myRating: 5 },
				),
			],
			NOW,
		);

		expect(
			toMyCoursesDigest(mine, NOW, LIMITS).toRate.map((item) => item.title),
		).toEqual(["asistió"]);
	});

	test("recorta a los límites y conserva los totales", () => {
		const mine = bucketMyCourses(
			["a", "b", "c", "d"].map((title) => recordOf("ENROLLED", { title })),
			NOW,
		);

		const digest = toMyCoursesDigest(mine, NOW, { ...LIMITS, upcoming: 2 });

		expect(digest.upcoming).toHaveLength(2);
		expect(digest.counts.upcoming).toBe(4);
	});
});
