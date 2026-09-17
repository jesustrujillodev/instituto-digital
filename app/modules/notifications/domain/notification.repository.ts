import type { ClaimedMessage, OutboxMessage } from "./notification.types";

export interface INotificationRepository {
	/** Entra en la transacción ambiental de quien avisa. */
	enqueue(messages: readonly OutboxMessage[]): Promise<void>;

	/**
	 * Reserva hasta `limit` mensajes vencidos con `FOR UPDATE SKIP LOCKED` y
	 * cuenta el intento. Dos workers nunca toman el mismo mensaje.
	 */
	claimDue(params: {
		now: Date;
		limit: number;
		leaseUntil: Date;
	}): Promise<ClaimedMessage[]>;
	markSent(id: number, at: Date): Promise<void>;
	markRetry(id: number, error: string, nextAttemptAt: Date): Promise<void>;
	markFailed(id: number, error: string): Promise<void>;
	/** Borra los enviados antes de `before`. Devuelve cuántos. */
	purgeSent(before: Date): Promise<number>;
}
