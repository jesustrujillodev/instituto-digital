import type {
	ClaimedMessage,
	OutboxMessage,
	OutboxRef,
} from "./notification.types";

export interface INotificationRepository {
	/** Entra en la transacción ambiental de quien avisa. */
	enqueue(messages: readonly OutboxMessage[]): Promise<OutboxRef[]>;

	/**
	 * Reserva hasta `limit` mensajes vencidos con `FOR UPDATE SKIP LOCKED` y
	 * cuenta el intento. Dos workers nunca toman el mismo mensaje.
	 */
	claimDue(params: {
		now: Date;
		limit: number;
		leaseUntil: Date;
	}): Promise<ClaimedMessage[]>;
	/**
	 * Reserva un mensaje concreto si sigue pendiente, vencido y libre, y cuenta
	 * el intento. `null` si ya salió o lo tiene otro.
	 */
	claimById(params: {
		id: number;
		now: Date;
		leaseUntil: Date;
	}): Promise<ClaimedMessage | null>;
	/** Pendientes, vencidos y libres: lo que el barrido vuelve a encolar. */
	findDispatchable(params: { now: Date; limit: number }): Promise<OutboxRef[]>;
	markSent(id: number, at: Date): Promise<void>;
	markRetry(id: number, error: string, nextAttemptAt: Date): Promise<void>;
	markFailed(id: number, error: string): Promise<void>;
	/** Borra los enviados antes de `before`. Devuelve cuántos. */
	purgeSent(before: Date): Promise<number>;
}
