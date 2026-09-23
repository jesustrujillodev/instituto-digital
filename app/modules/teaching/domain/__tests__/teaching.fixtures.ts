import { zonedInputToUtc } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	TeachingCourse,
	TeachingParticipant,
	TeachingSession,
} from "../teaching.types";

export const COURSE_DOC = "11111111-1111-4111-8111-111111111111";
export const SESSION_DOCS = [
	"21111111-1111-4111-8111-111111111111",
	"22222222-2222-4222-8222-222222222222",
	"23333333-3333-4333-8333-333333333333",
] as const;
export const ANA_DOC = "31111111-1111-4111-8111-111111111111";
export const LUIS_DOC = "32222222-2222-4222-8222-222222222222";

export const sessionOf = (
	index: number,
	date: string,
	overrides: Partial<TeachingSession> = {},
): TeachingSession => ({
	id: 100 + index,
	documentId:
		SESSION_DOCS[index] ?? `2${index}000000-0000-4000-8000-000000000000`,
	startsAt: zonedInputToUtc(date, "09:00"),
	endsAt: zonedInputToUtc(date, "12:00"),
	venue: "Aula 2",
	link: null,
	...overrides,
});

export const participantOf = (
	overrides: Partial<TeachingParticipant> = {},
): TeachingParticipant => ({
	userId: 50,
	userDocumentId: ANA_DOC,
	firstName: "Ana",
	lastName: "Ruiz",
	email: "ana@instituto.gob.mx",
	isInternal: true,
	currentDependencyId: 3,
	currentDependencyName: "Obras Públicas",
	result: "PENDING",
	grade: null,
	completed: false,
	progressPercent: 0,
	contentCompletedAt: null,
	attendance: [],
	...overrides,
});

/** Tres sesiones del 1 al 3 de septiembre de 2026, sin evaluación. */
export const courseOf = (
	overrides: Partial<TeachingCourse> = {},
): TeachingCourse => ({
	id: 10,
	documentId: COURSE_DOC,
	title: "Seguridad en obra",
	dependencyId: 3,
	dependencyName: "Obras Públicas",
	modality: "HYBRID",
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	status: "PUBLISHED",
	minAttendance: 80,
	requiresEvaluation: false,
	finishedAt: null,
	enrollmentClosedAt: null,
	qrToken: null,
	qrTokenRotatedAt: null,
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	sessions: [
		sessionOf(0, "2026-09-01"),
		sessionOf(1, "2026-09-02"),
		sessionOf(2, "2026-09-03"),
	],
	trainers: [
		{
			firstName: "Carlos",
			lastName: "Pérez",
			email: "carlos.sop@instituto.gob.mx",
		},
	],
	participants: [participantOf()],
	...overrides,
});

/** Asistió a las sesiones indicadas por índice; a las demás, marcado ausente. */
export const attendanceOf = (
	course: Pick<TeachingCourse, "sessions">,
	attended: readonly number[],
) =>
	course.sessions.map((session, index) => ({
		sessionId: session.id,
		attended: attended.includes(index),
	}));

export const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 9,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "carlos.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: true,
	...overrides,
});
