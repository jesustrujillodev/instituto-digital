import { formatSessionRange } from "@/lib/date-utils";

export type SessionRefs = readonly {
	documentId: string;
	startsAt: Date | string;
	endsAt: Date | string;
}[];

/** «Sesión 2 · 12-10-2026, 10:00 a 12:00». */
export const sessionLabel = (index: number, session: SessionRefs[number]) =>
	`Sesión ${index + 1} · ${formatSessionRange(
		new Date(session.startsAt),
		new Date(session.endsAt),
	)}`;

/** «Sesión 2», o `null` si la sesión ya no es del curso. */
export const sessionNumberLabel = (
	sessions: SessionRefs,
	sessionDocumentId: string,
) => {
	const index = sessions.findIndex(
		(session) => session.documentId === sessionDocumentId,
	);
	return index === -1 ? null : `Sesión ${index + 1}`;
};
