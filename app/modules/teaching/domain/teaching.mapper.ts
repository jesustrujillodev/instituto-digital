import type {
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentResult } from "@/modules/enrollments/domain/enrollment.config";
import type { TeachingScope } from "./teaching.access";
import {
	attendancePercent,
	attendedSessionsOf,
	canWrite,
	finishBlockerOf,
	finishOpensAt,
	isCompleted,
	isSessionOpen,
	pendingResultsOf,
} from "./teaching.rules";
import type {
	TeachingCourse,
	TeachingCourseSummary,
	TeachingDetail,
	TeachingPerson,
} from "./teaching.types";

type PersonRaw = TeachingPerson;

export interface TeachingCourseRaw {
	id: number;
	documentId: string;
	title: string;
	dependencyId: number;
	dependency: { name: string };
	modality: CourseModality;
	status: CourseStatus;
	minAttendance: number;
	requiresEvaluation: boolean;
	finishedAt: Date | null;
	sessions: readonly {
		id: number;
		documentId: string;
		startsAt: Date;
		endsAt: Date;
		venue: string | null;
		link: string | null;
	}[];
	trainers: readonly { user: PersonRaw }[];
	enrollments: readonly {
		result: EnrollmentResult;
		grade: number | null;
		completed: boolean;
		user: PersonRaw & {
			id: number;
			documentId: string;
			type: string;
			dependencyId: number | null;
			dependency: { name: string } | null;
			attendance: readonly { sessionId: number; attended: boolean }[];
		};
	}[];
}

const personOf = (raw: PersonRaw): TeachingPerson => ({
	firstName: raw.firstName,
	lastName: raw.lastName,
	email: raw.email,
});

/** `enrollments` debe venir filtrado a los `ENROLLED`. */
export const toTeachingCourse = (raw: TeachingCourseRaw): TeachingCourse => ({
	id: raw.id,
	documentId: raw.documentId,
	title: raw.title,
	dependencyId: raw.dependencyId,
	dependencyName: raw.dependency.name,
	modality: raw.modality,
	status: raw.status,
	minAttendance: raw.minAttendance,
	requiresEvaluation: raw.requiresEvaluation,
	finishedAt: raw.finishedAt,
	sessions: raw.sessions.map((session) => ({ ...session })),
	trainers: raw.trainers.map(({ user }) => personOf(user)),
	participants: raw.enrollments.map(({ user, ...enrollment }) => ({
		...personOf(user),
		userId: user.id,
		userDocumentId: user.documentId,
		isInternal: user.type === "INTERNAL",
		currentDependencyId: user.dependencyId,
		currentDependencyName: user.dependency?.name ?? null,
		result: enrollment.result,
		grade: enrollment.grade,
		completed: enrollment.completed,
		attendance: user.attendance.map((mark) => ({ ...mark })),
	})),
});

export interface TeachingCourseSummaryRaw {
	documentId: string;
	title: string;
	dependency: { name: string };
	modality: CourseModality;
	status: CourseStatus;
	sessions: readonly { startsAt: Date }[];
	_count: { enrollments: number };
}

export const toTeachingCourseSummary = (
	raw: TeachingCourseSummaryRaw,
): TeachingCourseSummary => ({
	documentId: raw.documentId,
	title: raw.title,
	dependencyName: raw.dependency.name,
	modality: raw.modality,
	status: raw.status,
	sessionCount: raw.sessions.length,
	firstSessionAt: raw.sessions.at(0)?.startsAt ?? null,
	lastSessionAt: raw.sessions.at(-1)?.startsAt ?? null,
	enrolledCount: raw._count.enrollments,
});

/**
 * La ficha de impartición. Sin ids internos: la pantalla trabaja con
 * `documentId`, igual que el resto del proyecto.
 */
export const toTeachingDetail = (
	course: TeachingCourse,
	scope: TeachingScope,
	now: Date,
): TeachingDetail => {
	const sessionCount = course.sessions.length;
	const writable = canWrite(course, scope);
	const finishBlocker = finishBlockerOf(course, now);

	return {
		course: {
			documentId: course.documentId,
			title: course.title,
			dependencyName: course.dependencyName,
			modality: course.modality,
			status: course.status,
			minAttendance: course.minAttendance,
			requiresEvaluation: course.requiresEvaluation,
			finishedAt: course.finishedAt,
			finishOpensAt: finishOpensAt(course),
			trainers: course.trainers,
		},
		sessions: course.sessions.map((session) => ({
			documentId: session.documentId,
			startsAt: session.startsAt,
			endsAt: session.endsAt,
			venue: session.venue,
			link: session.link,
			isOpen: course.status === "FINISHED" || isSessionOpen(session, now),
			recorded: course.participants.filter((participant) =>
				participant.attendance.some((mark) => mark.sessionId === session.id),
			).length,
		})),
		participants: course.participants.map((participant) => {
			const attended = attendedSessionsOf(participant);

			return {
				...personOf(participant),
				userDocumentId: participant.userDocumentId,
				dependencyName: participant.currentDependencyName,
				result: participant.result,
				grade: participant.grade,
				completed: participant.completed,
				wouldComplete: isCompleted({ ...course, sessionCount }, participant),
				attendedSessions: attended,
				attendancePercent: attendancePercent(attended, sessionCount),
				marks: Object.fromEntries(
					course.sessions.map((session) => [
						session.documentId,
						participant.attendance.find((mark) => mark.sessionId === session.id)
							?.attended ?? null,
					]),
				),
			};
		}),
		pendingResults: pendingResultsOf(course),
		finishBlocker,
		can: {
			recordAttendance: writable,
			recordResults: writable && course.requiresEvaluation,
			finish: finishBlocker === null,
			correct: course.status === "FINISHED" && writable,
		},
	};
};
