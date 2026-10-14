/** Lo que la API de Mailpit devuelve de un mensaje y que las pruebas comparan. */
export interface MailpitMessage {
	ID: string;
	Subject: string;
	From: { Address: string; Name: string };
	To: { Address: string }[];
	Text: string;
	HTML: string;
}

const apiUrl = () => {
	const url = process.env.MAILPIT_API_URL;
	if (!url) throw new Error("MAILPIT_API_URL no está definida");
	return url;
};

/**
 * Espera el primer correo para `to`: la entrega es asíncrona (outbox, cola,
 * worker). Cada prueba usa un destinatario único, así que no hay que limpiar
 * la bandeja entre pruebas.
 */
export const waitForMail = async (
	to: string,
	{ timeoutMs = 15_000 } = {},
): Promise<MailpitMessage> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const search = await fetch(
			`${apiUrl()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
		);
		const { messages } = (await search.json()) as {
			messages: { ID: string }[];
		};
		const [first] = messages;
		if (first) {
			const message = await fetch(`${apiUrl()}/api/v1/message/${first.ID}`);
			return (await message.json()) as MailpitMessage;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Ningún correo llegó a ${to} en ${timeoutMs} ms`);
};

/** Cuántos correos recibió `to` hasta ahora, sin esperar. */
export const countMail = async (to: string): Promise<number> => {
	const search = await fetch(
		`${apiUrl()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
	);
	const { messages_count } = (await search.json()) as {
		messages_count: number;
	};
	return messages_count;
};
