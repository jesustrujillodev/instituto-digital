import type { CourseModality } from "@/modules/courses/domain/course.rules";
import type { CoverResolver } from "@/modules/enrollments/domain/enrollment.mapper";
import type { CreditTally, MyCredit, MyCredits } from "./credit.types";

const MINUTE_MS = 60 * 1000;

export interface MyCreditRaw {
	documentId: string;
	fiscalYear: number;
	grantedAt: Date;
	dependency: { name: string };
	course: {
		documentId: string;
		title: string;
		modality: CourseModality;
		coverImageUrl: string | null;
		dependency: { name: string };
		/** Ordenadas por inicio. */
		sessions: readonly { startsAt: Date; endsAt: Date }[];
		/** La inscripción de la persona: a lo sumo una. */
		enrollments: readonly { grade: number | null }[];
	};
}

export const toMyCredit = (
	raw: MyCreditRaw,
	attendedSessions: number,
	resolveCover: CoverResolver,
): MyCredit => {
	const { course } = raw;

	return {
		documentId: raw.documentId,
		dependencyName: raw.dependency.name,
		fiscalYear: raw.fiscalYear,
		grantedAt: raw.grantedAt,
		course: {
			documentId: course.documentId,
			title: course.title,
			modality: course.modality,
			coverUrl: resolveCover(course.coverImageUrl),
			dependencyName: course.dependency.name,
			sessionCount: course.sessions.length,
			firstSessionAt: course.sessions.at(0)?.startsAt ?? null,
			lastSessionEndsAt: course.sessions.at(-1)?.endsAt ?? null,
			totalMinutes: course.sessions.reduce(
				(total, session) =>
					total +
					(session.endsAt.getTime() - session.startsAt.getTime()) / MINUTE_MS,
				0,
			),
		},
		attendedSessions,
		grade: course.enrollments.at(0)?.grade ?? null,
	};
};

const tally = <T>(items: readonly T[], keyOf: (item: T) => string) => {
	const totals = new Map<string, number>();
	for (const item of items) {
		const key = keyOf(item);
		totals.set(key, (totals.get(key) ?? 0) + 1);
	}
	return totals;
};

/** Total del ejercicio, acumulado histórico y ejercicios disponibles (§6.9). */
export const summarizeMine = (
	credits: readonly MyCredit[],
	fiscalYear: number,
): MyCredits => {
	const ofYear = credits.filter((credit) => credit.fiscalYear === fiscalYear);

	const perYear = tally(credits, (credit) => String(credit.fiscalYear));
	if (!perYear.has(String(fiscalYear))) perYear.set(String(fiscalYear), 0);

	const byDependency: CreditTally[] = [
		...tally(ofYear, (credit) => credit.dependencyName),
	]
		.map(([label, total]) => ({ label, total }))
		.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "es"));

	return {
		fiscalYear,
		yearTotal: ofYear.length,
		historicTotal: credits.length,
		years: [...perYear]
			.map(([year, total]) => ({ fiscalYear: Number(year), total }))
			.sort((a, b) => b.fiscalYear - a.fiscalYear),
		byDependency,
		credits: ofYear,
	};
};
