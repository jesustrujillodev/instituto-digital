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
import type { CheckInCourse, CheckInSession } from "./check-in.types";

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const checkInTokenRule = v.pipe(
	v.string(),
	v.regex(QR_TOKEN_PATTERN, "Token de asistencia con formato inválido"),
);

export const rotateQrTokenRule = v.object({
	documentId: v.pipe(v.string(), v.uuid()),
});

export const checkInRules = {
	token: checkInTokenRule,
	rotate: rotateQrTokenRule,
} as const;

// ── Ventana de escaneo ────────────────────────────────────────────────────────

export interface CheckInWindow {
	opensBeforeMinutes: number;
	closesAfterMinutes: number;
}

export interface SessionWindow {
	opensAt: Date;
	closesAt: Date;
}

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
	| { kind: "TOO_EARLY"; session: CheckInSession; opensAt: Date }
	| { kind: "CLOSED"; session: CheckInSession; closedAt: Date }
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

	let earliestOpen: { session: CheckInSession; opensAt: Date } | null = null;
	let upcoming: { session: CheckInSession; opensAt: Date } | null = null;
	let latestClosed: { session: CheckInSession; closedAt: Date } | null = null;

	for (const session of sessions) {
		const { opensAt, closesAt } = windowOf(session, window);

		if (opensAt <= now && now <= closesAt) {
			if (!earliestOpen || opensAt < earliestOpen.opensAt) {
				earliestOpen = { session, opensAt };
			}
		} else if (now < opensAt) {
			if (!upcoming || opensAt < upcoming.opensAt) {
				upcoming = { session, opensAt };
			}
		} else if (!latestClosed || closesAt > latestClosed.closedAt) {
			latestClosed = { session, closedAt: closesAt };
		}
	}

	if (earliestOpen) return { kind: "ACTIVE", session: earliestOpen.session };
	if (upcoming) {
		return {
			kind: "TOO_EARLY",
			session: upcoming.session,
			opensAt: upcoming.opensAt,
		};
	}
	if (latestClosed) {
		return {
			kind: "CLOSED",
			session: latestClosed.session,
			closedAt: latestClosed.closedAt,
		};
	}

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
			throw new CheckInSessionNotOpenError(outcome.opensAt);
		case "CLOSED":
			throw new CheckInSessionClosedError(outcome.closedAt);
		case "WITHOUT_SESSIONS":
			throw new CheckInWithoutSessionsError();
	}
}
