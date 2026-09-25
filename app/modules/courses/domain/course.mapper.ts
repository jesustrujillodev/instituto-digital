import * as v from "valibot";
import { courseDetailSchema, courseSummarySchema } from "./course.rules";
import type { CourseDetail, CourseSummary } from "./course.types";

type NamedAccount = {
	firstName: string | null;
	lastName: string | null;
};

/** "Ana López", o null si la cuenta no tiene nombre capturado. */
const fullNameOf = (
	account: NamedAccount | null | undefined,
): string | null => {
	if (!account) return null;

	const name = [account.firstName, account.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	return name.length > 0 ? name : null;
};

type CourseRawBase = {
	_count?: { sessions: number; trainers: number };
	dependency?: { name: string };
	createdBy?: NamedAccount | null;
	[key: string]: unknown;
};

/** Al listar basta `startsAt`: el primer y el último elemento son el rango. */
type SummaryRaw = CourseRawBase & {
	sessions?: readonly { startsAt: Date }[];
};

/**
 * Fila cruda de persistencia → curso de listado.
 *
 * Ni los conteos ni el rango de fechas son columnas: llegan del `_count` y de
 * las sesiones ordenadas, y se aplanan aquí para que ninguna capa de arriba
 * conozca su forma.
 */
export const toSummary = (raw: SummaryRaw): CourseSummary => {
	const { _count, dependency, createdBy, sessions, ...rest } = raw;
	const ordered = sessions ?? [];

	return v.parse(courseSummarySchema, {
		...rest,
		dependencyName: dependency?.name ?? "",
		sessionCount: _count?.sessions ?? ordered.length,
		trainerCount: _count?.trainers ?? 0,
		firstSessionAt: ordered.at(0)?.startsAt ?? null,
		lastSessionAt: ordered.at(-1)?.startsAt ?? null,
		createdByName: fullNameOf(createdBy),
	});
};

type DetailRaw = CourseRawBase & {
	sessions?: readonly {
		id: number;
		documentId: string;
		startsAt: Date;
		endsAt: Date;
		venue: string | null;
		link: string | null;
	}[];
	trainers?: readonly {
		user: {
			documentId: string;
			firstName: string | null;
			lastName: string | null;
			email: string;
			archivedAt: Date | null;
			trainerProfile: { specialty: string; archivedAt: Date | null } | null;
		};
	}[];
	dependencyAudience?: readonly {
		dependency: { documentId: string; name: string };
	}[];
	planLine?: {
		documentId: string;
		title: string;
		plan: { documentId: string; fiscalYear: number };
	} | null;
	groupAudience?: readonly {
		group: {
			documentId: string;
			name: string;
			dependency?: { name: string } | null;
		};
	}[];
};

/**
 * Fila cruda → curso completo.
 *
 * `isActive` del capacitador se deriva de que ni la cuenta ni el perfil estén
 * archivados. Es la misma derivación que hace `isTrainer` en el mapper de
 * `users`: la verdad vive en la relación, no en una columna que sincronizar.
 */
export const toDetail = (raw: DetailRaw): CourseDetail => {
	const summary = toSummary(raw);
	const sessions = (raw.sessions ?? []).map((session) => ({
		id: session.id,
		documentId: session.documentId,
		startsAt: session.startsAt,
		endsAt: session.endsAt,
		venue: session.venue,
		link: session.link,
	}));

	return v.parse(courseDetailSchema, {
		...summary,
		...raw,
		planLine: raw.planLine
			? {
					documentId: raw.planLine.documentId,
					title: raw.planLine.title,
					planDocumentId: raw.planLine.plan.documentId,
					fiscalYear: raw.planLine.plan.fiscalYear,
				}
			: null,
		sessions,
		trainers: (raw.trainers ?? []).map(({ user }) => ({
			userDocumentId: user.documentId,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			specialty: user.trainerProfile?.specialty ?? "",
			isActive:
				user.archivedAt === null && user.trainerProfile?.archivedAt === null,
		})),
		audience: {
			dependencies: (raw.dependencyAudience ?? []).map(({ dependency }) => ({
				documentId: dependency.documentId,
				name: dependency.name,
			})),
			groups: (raw.groupAudience ?? []).map(({ group }) => ({
				documentId: group.documentId,
				name: group.name,
			})),
		},
	});
};
