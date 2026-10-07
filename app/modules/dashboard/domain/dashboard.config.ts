/**
 * Cuánto lee y enseña cada bloque del panel. Lo que pasa del tope se nombra
 * con «y N más» hacia la pantalla dueña, que es donde se trabaja la lista.
 */
export const DASHBOARD_LIMITS = {
	/** El superadministrador ve toda la plataforma: la semana se recorta. */
	weekSessions: 60,
	today: 6,
	invitations: 4,
	inProgress: 4,
	upcoming: 3,
	toRate: 3,
	certificates: 3,
	pendingFinish: 6,
	attention: 5,
	openEnrollment: 6,
	dueLines: 6,
} as const;
