import * as v from "valibot";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { StoredEnrollment } from "@/modules/enrollments/domain/enrollment.types";
import { QR_TOKEN_PATTERN } from "./check-in.config";
import {
	CheckInCourseNotOpenError,
	CheckInInvitationPendingError,
	CheckInNotEnrolledError,
	CheckInSessionClosedError,
	CheckInSessionNotOpenError,
	CheckInWithoutSessionsError,
} from "./check-in.errors";
import type {
	CheckInCourse,
	CheckInSession,
	CheckInWindow,
	SessionWindow,
} from "./check-in.types";

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const checkInTokenRule = v.pipe(
	v.string("Falta el código de asistencia."),
	v.regex(QR_TOKEN_PATTERN, "El código de asistencia no es válido."),
);

export const rotateQrTokenRule = v.object({
	documentId: v.pipe(
		v.string("Falta el identificador del curso."),
		v.uuid("El identificador del curso no es válido."),
	),
});

export const checkInRules = {
	token: checkInTokenRule,
	rotate: rotateQrTokenRule,
} as const;

// ── Ventana de escaneo ────────────────────────────────────────────────────────

const MINUTE_MS = 60_000;

export const windowOf = (
	session: Pick<CheckInSession, "startsAt" | "endsAt">,
	window: CheckInWindow,
): SessionWindow => ({
	opensAt: new Date(
		session.startsAt.getTime() - window.opensBeforeMinutes * MINUTE_MS,
	),
	closesAt: new Date(
		session.endsAt.getTime() + window.closesAfterMinutes * MINUTE_MS,
	),
});

export const windowOfCourse = (
	course: Pick<CheckInCourse, "qrOpensBeforeMinutes" | "qrClosesAfterMinutes">,
): CheckInWindow => ({
	opensBeforeMinutes: course.qrOpensBeforeMinutes,
	closesAfterMinutes: course.qrClosesAfterMinutes,
});

export type SessionOutcome =
	| { kind: "ACTIVE"; session: CheckInSession }
	| { kind: "TOO_EARLY"; session: CheckInSession; window: SessionWindow }
	| { kind: "CLOSED"; session: CheckInSession; window: SessionWindow }
	| { kind: "WITHOUT_SESSIONS" };

/**
 * Qué sesión marca un escaneo hecho en `now`.
 *
 * Gana la ventana ABIERTA más temprana: con dos sesiones el mismo día y una
 * tolerancia amplia las ventanas pueden solaparse, y la regla tiene que ser
 * determinista porque quien escanea no elige. Si ninguna está abierta, se
 * devuelve la próxima que abrirá o la última que cerró, para poder decir cuándo.
 */
export const resolveSessionOutcome = (
	sessions: readonly CheckInSession[],
	window: CheckInWindow,
	now: Date,
): SessionOutcome => {
	if (sessions.length === 0) return { kind: "WITHOUT_SESSIONS" };

	type Candidate = { session: CheckInSession; window: SessionWindow };

	let earliestOpen: Candidate | null = null;
	let upcoming: Candidate | null = null;
	let latestClosed: Candidate | null = null;

	for (const session of sessions) {
		const sessionWindow = windowOf(session, window);
		const { opensAt, closesAt } = sessionWindow;

		if (opensAt <= now && now <= closesAt) {
			if (!earliestOpen || opensAt < earliestOpen.window.opensAt) {
				earliestOpen = { session, window: sessionWindow };
			}
		} else if (now < opensAt) {
			if (!upcoming || opensAt < upcoming.window.opensAt) {
				upcoming = { session, window: sessionWindow };
			}
		} else if (!latestClosed || closesAt > latestClosed.window.closesAt) {
			latestClosed = { session, window: sessionWindow };
		}
	}

	if (earliestOpen) return { kind: "ACTIVE", session: earliestOpen.session };
	if (upcoming) return { kind: "TOO_EARLY", ...upcoming };
	if (latestClosed) return { kind: "CLOSED", ...latestClosed };

	return { kind: "WITHOUT_SESSIONS" };
};

// ── Guardas ───────────────────────────────────────────────────────────────────

/** Un finalizado no admite escaneos: la corrección es manual y recalcula créditos. */
export const isCheckInOpen = (course: Pick<CheckInCourse, "status">): boolean =>
	course.status === "PUBLISHED";

export function assertCheckInOpen(course: Pick<CheckInCourse, "status">): void {
	if (!isCheckInOpen(course)) throw new CheckInCourseNotOpenError();
}

const ENROLLED: EnrollmentStatus = "ENROLLED";
const INVITED: EnrollmentStatus = "INVITED";

/**
 * El escaneo nunca inscribe: aceptar una invitación mira cupo, fecha límite y
 * audiencia, reglas que viven en `enrollments` y no se duplican aquí.
 */
export function assertEnrolled(
	enrollment: Pick<StoredEnrollment, "status"> | null,
	courseDocumentId: string,
): void {
	if (enrollment?.status === ENROLLED) return;
	if (enrollment?.status === INVITED) {
		throw new CheckInInvitationPendingError(courseDocumentId);
	}
	throw new CheckInNotEnrolledError();
}

export function assertActiveSession(
	outcome: SessionOutcome,
): asserts outcome is Extract<SessionOutcome, { kind: "ACTIVE" }> {
	switch (outcome.kind) {
		case "ACTIVE":
			return;
		case "TOO_EARLY":
			throw new CheckInSessionNotOpenError(outcome.window);
		case "CLOSED":
			throw new CheckInSessionClosedError(outcome.window);
		case "WITHOUT_SESSIONS":
			throw new CheckInWithoutSessionsError();
	}
}
