/** Un correo ya redactado. El remitente lo pone el adaptador, no quien envía. */
export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	html: string;
}

/**
 * Transporte de correo. Lanza si el servidor rechaza el mensaje: reintentar es
 * decisión del worker del outbox, no del adaptador.
 */
export interface IMailer {
	send(message: MailMessage): Promise<void>;
}
