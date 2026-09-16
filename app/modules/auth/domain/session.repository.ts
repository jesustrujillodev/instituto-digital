import type { ListSessionsDto, Session } from "./auth.types";

export type RotateOutcome = "rotated" | "stale";

export interface SessionRepository {
	create(params: {
		userId: number;
		refreshTokenHash: string;
		expiresAt: Date;
		userAgent?: string;
		ipAddress?: string;
	}): Promise<Session>;

	// Busca por hash contra el token VIGENTE o el ANTERIOR (ventana de gracia).
	// El caso de uso distingue cuál coincidió comparando los campos de la sesión.
	findByTokenHash(tokenHash: string): Promise<Session | null>;

	// Rotación compare-and-swap: solo rota si expectedTokenHash sigue siendo el
	// vigente. "stale" ⇒ otro proceso rotó primero; el caso de uso re-evalúa.
	// Guarda el hash anterior + rotatedAt para la ventana de gracia.
	rotateIfCurrent(params: {
		sessionId: string;
		expectedTokenHash: string;
		newTokenHash: string;
		newExpiresAt: Date;
		rotatedAt: Date;
	}): Promise<RotateOutcome>;

	// ── Lectura administrativa (monitor de sesiones) ──────────────────────────
	// Página del listado global. El dueño NO se resuelve aquí: la tabla no está
	// denormalizada y el caso de uso lo pide al repositorio de usuarios.
	findAll(filters: ListSessionsDto): Promise<Session[]>;

	// Total sin paginar para los mismos filtros — consulta separada de findAll,
	// igual que en el listado de usuarios.
	count(filters: ListSessionsDto): Promise<number>;

	// Lookup por id PÚBLICO. A diferencia de findByTokenHash, que recibe un hash
	// secreto, este es el que puede usar una pantalla de administración.
	findById(sessionId: string): Promise<Session | null>;

	deleteById(sessionId: string): Promise<void>;

	deleteAllByUserId(userId: number): Promise<void>;

	// Cierre global del monitor: revoca todo SALVO la sesión indicada —la de
	// quien ejecuta la acción— para que no se expulse a sí mismo del panel.
	// Devuelve cuántas se revocaron.
	deleteAllExcept(sessionId: string): Promise<number>;

	// Cap de sesiones: conserva las `keep` más recientes del usuario y elimina
	// el resto (las más antiguas primero).
	deleteOldestExceeding(params: {
		userId: number;
		keep: number;
	}): Promise<void>;

	// Elimina las sesiones ya expiradas. Es higiene de datos, no seguridad: una
	// sesión expirada ya se rechaza en el caso de uso. Devuelve el conteo para
	// que quien la dispare desde el panel sepa qué pasó.
	deleteExpired(): Promise<number>;
}
