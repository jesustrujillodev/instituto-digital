import type { Logger } from "@/shared/logging/logger";
import type { IMailer } from "./mailer.port";

/**
 * Sin SMTP configurado. Registra destinatario y asunto —nunca el cuerpo, que
 * lleva datos personales— y da el mensaje por enviado.
 */
export const createLogMailer = (logger: Logger): IMailer => ({
	async send({ to, subject }) {
		logger.info("email not sent: SMTP is not configured", { to, subject });
	},
});
