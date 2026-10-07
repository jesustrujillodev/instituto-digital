import { countsAttendance } from "@/modules/courses/domain/course.rules";
import { canRateCourse } from "@/modules/ratings/domain/rating.rules";
import { accreditationGapsOf } from "@/modules/teaching/domain/teaching.rules";
import {
	classifyMyCourse,
	courseTimelineOf,
	enrollmentClosesAt,
	isClosingSoon,
} from "./enrollment.rules";
import type {
	MyCourseEntry,
	MyCourseRecord,
	MyCourses,
} from "./enrollment.types";
import type {
	AttendanceOutlook,
	MyCourseDigestItem,
	MyCoursesDigest,
	MyCoursesDigestLimits,
} from "./enrollment-summary.types";

/** Solo valora quien no lo ha hecho y cumple lo que pide el curso. */
export const toMyCourseEntry = (
	record: MyCourseRecord,
	now: Date,
): MyCourseEntry => ({
	...record,
	timeline: courseTimelineOf(record.course, now),
	gaps: accreditationGapsOf(
		{ ...record.course, sessionCount: record.course.sessions.length },
		{
			attendedSessions: record.outcome.attendedSessions,
			contentCompletedAt: record.outcome.contentCompletedAt,
			result: record.enrollment.result,
			grade: record.outcome.grade,
		},
	),
	canRate:
		record.outcome.myRating === null &&
		canRateCourse({
			courseStatus: record.course.status,
			courseFormat: record.course.format,
			enrollmentStatus: record.enrollment.status,
			attendedSessions: record.outcome.attendedSessions,
			completed: record.outcome.completed,
		}),
});

/** Las secciones de «Mis cursos». Una invitación solo cuenta mientras el curso siga publicado. */
export const bucketMyCourses = (
	records: readonly MyCourseRecord[],
	now: Date,
): MyCourses => {
	const mine: MyCourses = {
		invitations: [],
		upcoming: [],
		inProgress: [],
		finished: [],
		withdrawn: [],
	};

	for (const record of records) {
		const entry = toMyCourseEntry(record, now);
		if (entry.enrollment.status === "WITHDRAWN") {
			mine.withdrawn.push(entry);
			continue;
		}
		if (entry.enrollment.status === "INVITED") {
			if (entry.course.status === "PUBLISHED") mine.invitations.push(entry);
			continue;
		}
		mine[classifyMyCourse(entry.course, now, entry.outcome.completed)].push(
			entry,
		);
	}

	return mine;
};

/**
 * La menor asistencia que cumple el mínimo, con la misma comparación entera de
 * `meetsAttendance`: 2 de 3 con mínimo 67 % no basta.
 */
export const attendanceOutlookOf = (
	attended: number,
	held: number,
	total: number,
	minAttendance: number,
): AttendanceOutlook => {
	const required = Math.ceil((minAttendance * total) / 100);
	const needed = Math.max(0, required - attended);
	const remaining = Math.max(0, total - held);

	return { attended, needed, remaining, reachable: needed <= remaining };
};

const digestItemOf = (entry: MyCourseEntry): MyCourseDigestItem => ({
	courseDocumentId: entry.course.documentId,
	title: entry.course.title,
	dependencyName: entry.course.dependencyName,
	modality: entry.course.modality,
	format: entry.course.format,
});

const byClosingDate = (a: Date | null, b: Date | null) =>
	(a?.getTime() ?? Number.POSITIVE_INFINITY) -
	(b?.getTime() ?? Number.POSITIVE_INFINITY);

/** Lo que el panel de inicio enseña de «Mis cursos»: lo que pide una acción. */
export const toMyCoursesDigest = (
	mine: MyCourses,
	now: Date,
	limits: MyCoursesDigestLimits,
): MyCoursesDigest => {
	const invitations = mine.invitations
		.map((entry) => {
			const closesAt = enrollmentClosesAt(entry.course);
			return {
				...digestItemOf(entry),
				closesAt,
				closesSoon: isClosingSoon(closesAt, now),
				firstSessionAt: entry.course.firstSessionAt,
			};
		})
		.sort((a, b) => byClosingDate(a.closesAt, b.closesAt));

	const inProgress = mine.inProgress.map((entry) => ({
		...digestItemOf(entry),
		completionRule: entry.course.completionRule,
		progressPercent: entry.outcome.progressPercent,
		sessionCount: entry.course.sessions.length,
		nextSession: entry.timeline.nextSession,
		attendance:
			countsAttendance(entry.course.completionRule) &&
			entry.course.sessions.length > 0
				? attendanceOutlookOf(
						entry.outcome.attendedSessions,
						entry.timeline.sessionsHeld,
						entry.course.sessions.length,
						entry.course.minAttendance,
					)
				: null,
	}));

	const upcoming = mine.upcoming
		.map((entry) => ({
			...digestItemOf(entry),
			firstSessionAt: entry.course.firstSessionAt,
			daysToStart: entry.timeline.daysToStart,
		}))
		.sort((a, b) => byClosingDate(a.firstSessionAt, b.firstSessionAt));

	const toRate = [...mine.inProgress, ...mine.finished]
		.filter((entry) => entry.canRate)
		.map(digestItemOf);

	return {
		invitations: invitations.slice(0, limits.invitations),
		inProgress: inProgress.slice(0, limits.inProgress),
		upcoming: upcoming.slice(0, limits.upcoming),
		toRate: toRate.slice(0, limits.toRate),
		counts: {
			invitations: invitations.length,
			inProgress: inProgress.length,
			upcoming: upcoming.length,
			toRate: toRate.length,
			finished: mine.finished.length,
		},
	};
};
