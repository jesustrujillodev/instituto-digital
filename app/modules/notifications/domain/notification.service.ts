import type { NotificationEvent, NotifyResponse } from "./notification.types";

/**
 * Avisos por correo de §6.12.
 *
 * `notify` solo ENCOLA: el envío lo hace el worker del outbox. Se llama dentro
 * de la transacción del caso de uso para que un aviso no salga de una operación
 * revertida (docs/adr/0008). Si encolar falla, la operación no se bloquea: el
 * fallo queda en el log.
 */
export interface INotificationService {
	notify(events: readonly NotificationEvent[]): Promise<NotifyResponse>;
}
