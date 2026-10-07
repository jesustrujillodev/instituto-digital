import { startOfZonedDay } from "@/lib/date-utils";
import { LOW_ENROLLMENT } from "./enrollment.config";
import { enrollmentClosesAt, isClosingSoon } from "./enrollment.rules";
import type {
	OpenEnrollmentRecord,
	OpenEnrollmentRow,
	OpenEnrollmentSummary,
} from "./enrollment-summary.types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Empieza pronto y con pocos inscritos para su cupo. */
export const lowEnrollmentOf = (
	course: Pick<OpenEnrollmentRow, "capacity" | "enrolled" | "firstSessionAt">,
	now: Date,
): boolean => {
	if (!course.firstSessionAt) return false;

	const startsIn = course.firstSessionAt.getTime() - now.getTime();
	if (startsIn <= 0 || startsIn > LOW_ENROLLMENT.startsWithinDays * DAY_MS) {
		return false;
	}

	return course.capacity === null
		? course.enrolled === 0
		: course.enrolled < course.capacity * LOW_ENROLLMENT.minFillRatio;
};

/** `round`: el cambio de horario deja días de 23 o 25 horas. */
const daysUntil = (when: Date | null, now: Date): number | null =>
	when && when > now
		? Math.round(
				(startOfZonedDay(when).getTime() - startOfZonedDay(now).getTime()) /
					DAY_MS,
			)
		: null;

/** Ordenados por cierre: lo que cierra antes, primero; sin cierre, al final. */
export const toOpenEnrollmentSummary = (
	records: readonly (OpenEnrollmentRecord & { invited: number })[],
	now: Date,
	limit: number,
): OpenEnrollmentSummary => {
	const rows = records.map((record): OpenEnrollmentRow => {
		const closesAt = enrollmentClosesAt({
			format: record.format,
			enrollmentDeadline: record.enrollmentDeadline,
			firstSessionAt: record.firstSessionAt,
		});

		return {
			documentId: record.documentId,
			title: record.title,
			format: record.format,
			capacity: record.capacity,
			enrolled: record.enrolled,
			invited: record.invited,
			closesAt,
			firstSessionAt: record.firstSessionAt,
			closesSoon: isClosingSoon(closesAt, now),
			startsInDays: daysUntil(record.firstSessionAt, now),
			lowEnrollment: lowEnrollmentOf(record, now),
		};
	});

	rows.sort(
		(a, b) =>
			(a.closesAt?.getTime() ?? Number.POSITIVE_INFINITY) -
			(b.closesAt?.getTime() ?? Number.POSITIVE_INFINITY),
	);

	return { courses: rows.slice(0, limit), total: rows.length };
};
