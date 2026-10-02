import type { SessionMaterialCourseWhere } from "./session-material.rules";
import type {
	SessionMaterialCourseRef,
	SessionMaterialsRaw,
	SessionMaterialWrite,
} from "./session-material.types";

export interface ISessionMaterialRepository {
	findCourse(
		courseDocumentId: string,
		where: SessionMaterialCourseWhere,
	): Promise<SessionMaterialCourseRef | null>;
	/** Las sesiones del curso por inicio, cada una con su material por alta. */
	findSessions(courseId: number): Promise<SessionMaterialsRaw[]>;
	/**
	 * Las del curso, o solo esa sesión si se indica, siempre que el usuario esté
	 * inscrito; `null` si no lo está.
	 */
	findSessionsForParticipant(
		courseDocumentId: string,
		userId: number,
		sessionDocumentId?: string,
	): Promise<SessionMaterialsRaw[] | null>;
	findSession(
		courseId: number,
		sessionDocumentId: string,
	): Promise<{ id: number; materialCount: number } | null>;
	findMaterial(
		courseId: number,
		materialDocumentId: string,
	): Promise<{ id: number; fileUrl: string | null } | null>;
	create(
		sessionId: number,
		write: SessionMaterialWrite,
	): Promise<{ documentId: string }>;
	update(
		id: number,
		patch: { title: string; availableFromSession: boolean },
	): Promise<void>;
	remove(id: number): Promise<void>;
}
