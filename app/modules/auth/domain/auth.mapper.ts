import * as v from "valibot";
import type { SafeUser } from "@/modules/users/domain/user.types";
import { sessionSchema } from "./auth.rules";
import type { Session, SessionSummary } from "./auth.types";

export const toSessionDomain = (raw: Record<string, unknown>): Session => {
	return v.parse(sessionSchema, raw);
};

/**
 * Proyecta una sesión a lo que puede ver una pantalla de administración.
 *
 * Los hashes se quedan fuera por construcción: este mapper enumera los campos
 * que salen en vez de omitir los que no, así que añadir una columna secreta al
 * modelo no la filtra por descuido.
 *
 * @param owner Dueño ya resuelto por relación, o `null` si la fila quedó
 *   huérfana entre la lectura del listado y la del usuario (la FK es `cascade`,
 *   así que en la práctica es una carrera, no un estado persistente).
 */
export const toSessionSummary = (
	session: Session,
	owner: SafeUser | null,
	ctx: { now: number; currentSessionId: string | null },
): SessionSummary => ({
	id: session.id,
	userId: session.userId,
	ownerEmail: owner?.email ?? "—",
	ownerFullName: owner
		? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null
		: null,
	userAgent: session.userAgent,
	ipAddress: session.ipAddress,
	expiresAt: session.expiresAt,
	createdAt: session.createdAt,
	isExpired: session.expiresAt.getTime() < ctx.now,
	isCurrent: session.id === ctx.currentSessionId,
});
