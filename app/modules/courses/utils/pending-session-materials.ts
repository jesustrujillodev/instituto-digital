import {
	DATE_INPUT_PATTERN,
	TIME_INPUT_PATTERN,
	zonedInputToUtc,
} from "@/lib/date-utils";
import type {
	NewSessionMaterial,
	PendingSessionMaterial,
} from "@/modules/content/domain/session-material.types";
import type { CourseSessionFormValues } from "./build-course-form-defaults";

/** El material de las sesiones nuevas, tal como estaba al guardar el paso. */
export interface PendingMaterialsSnapshot {
	/** Las sesiones que ya existían: ninguna de ellas es la dueña de lo pendiente. */
	known: string[];
	entries: {
		date: string;
		startTime: string;
		materials: PendingSessionMaterial[];
	}[];
}

export interface SavedSession {
	documentId: string;
	startsAt: Date | string;
}

export const pendingSessionMaterialsOf = (
	sessions: readonly CourseSessionFormValues[],
): PendingMaterialsSnapshot => ({
	known: sessions.flatMap((session) =>
		session.documentId ? [session.documentId] : [],
	),
	entries: sessions
		.filter(
			(session) => session.documentId === "" && session.materials.length > 0,
		)
		.map(({ date, startTime, materials }) => ({ date, startTime, materials })),
});

const instantOf = (date: string, startTime: string) =>
	DATE_INPUT_PATTERN.test(date) && TIME_INPUT_PATTERN.test(startTime)
		? zonedInputToUtc(date, startTime).getTime()
		: null;

/**
 * A qué sesión recién guardada pertenece cada grupo pendiente.
 *
 * Se reconoce por su inicio y no por su posición: al guardar, el servidor
 * ordena las sesiones por fecha. Lo que no encuentra dueña se devuelve por
 * nombre, para decir qué no se guardó.
 */
export const matchPendingMaterials = (
	snapshot: PendingMaterialsSnapshot,
	saved: readonly SavedSession[],
): {
	groups: { sessionDocumentId: string; materials: NewSessionMaterial[] }[];
	orphaned: string[];
} => {
	const taken = new Set(snapshot.known);
	const groups: {
		sessionDocumentId: string;
		materials: NewSessionMaterial[];
	}[] = [];
	const orphaned: string[] = [];

	for (const entry of snapshot.entries) {
		const at = instantOf(entry.date, entry.startTime);
		const owner = saved.find(
			(session) =>
				!taken.has(session.documentId) &&
				new Date(session.startsAt).getTime() === at,
		);

		if (!owner) {
			orphaned.push(...entry.materials.map((material) => material.title));
			continue;
		}

		taken.add(owner.documentId);
		groups.push({
			sessionDocumentId: owner.documentId,
			materials: entry.materials.map(
				({ draftId: _draftId, ...material }) => material,
			),
		});
	}

	return { groups, orphaned };
};
