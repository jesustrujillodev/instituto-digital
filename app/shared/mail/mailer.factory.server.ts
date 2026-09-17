import nodemailer from "nodemailer";
import type { Env } from "@/core/env.server";
import type { Logger } from "@/shared/logging/logger";
import { createLogMailer } from "./log.mailer.server";
import type { IMailer } from "./mailer.port";
import { createSmtpMailer } from "./smtp.mailer.server";

/** Arma el mailer desde el entorno YA validado: SMTP si hay host, log si no. */
export const createMailerFromEnv = (
	env: Pick<
		Env,
		| "SMTP_HOST"
		| "SMTP_PORT"
		| "SMTP_SECURE"
		| "SMTP_USER"
		| "SMTP_PASSWORD"
		| "MAIL_FROM"
	>,
	logger: Logger,
): IMailer => {
	if (!env.SMTP_HOST || !env.MAIL_FROM) return createLogMailer(logger);

	const transport = nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		secure: env.SMTP_SECURE === "true",
		...(env.SMTP_USER && {
			auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" },
		}),
	});

	return createSmtpMailer(transport, env.MAIL_FROM);
};
