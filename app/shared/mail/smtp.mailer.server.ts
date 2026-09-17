import type { IMailer } from "./mailer.port";

export interface SmtpConfig {
	host: string;
	port: number;
	secure: boolean;
	user?: string;
	password?: string;
	from: string;
}

/** Lo único del transporte de nodemailer que usa el adaptador. */
export interface SmtpTransport {
	sendMail(message: {
		from: string;
		to: string;
		subject: string;
		text: string;
		html: string;
	}): Promise<unknown>;
}

/** El transporte llega construido para poder probar el adaptador sin red. */
export const createSmtpMailer = (
	transport: SmtpTransport,
	from: string,
): IMailer => ({
	async send(message) {
		await transport.sendMail({ from, ...message });
	},
});
