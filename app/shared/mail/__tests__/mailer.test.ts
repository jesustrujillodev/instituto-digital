import { describe, expect, test } from "vitest";
import type { Logger } from "@/shared/logging/logger";
import { createLogMailer } from "../log.mailer.server";
import { createMailerFromEnv } from "../mailer.factory.server";
import { createSmtpMailer } from "../smtp.mailer.server";

const MESSAGE = {
	to: "ana@instituto.gob.mx",
	subject: "Asunto",
	text: "Cuerpo con datos personales",
	html: "<p>Cuerpo con datos personales</p>",
};

const recordingLogger = () => {
	const entries: unknown[][] = [];
	const logger: Logger = {
		debug: () => {},
		info: (...args: unknown[]) => {
			entries.push(args);
		},
		warn: () => {},
		error: () => {},
		child: () => logger,
	};
	return { logger, entries };
};

describe("createSmtpMailer", () => {
	test("pasa el remitente configurado y el mensaje al transporte", async () => {
		const sent: unknown[] = [];
		const mailer = createSmtpMailer(
			{ sendMail: async (message) => sent.push(message) },
			"Instituto <no-responder@instituto.gob.mx>",
		);

		await mailer.send(MESSAGE);

		expect(sent).toEqual([
			{ from: "Instituto <no-responder@instituto.gob.mx>", ...MESSAGE },
		]);
	});

	test("un rechazo del servidor se propaga para que el worker reintente", async () => {
		const mailer = createSmtpMailer(
			{
				sendMail: async () => {
					throw new Error("550 mailbox unavailable");
				},
			},
			"x@y.z",
		);

		await expect(mailer.send(MESSAGE)).rejects.toThrow("550");
	});
});

describe("createLogMailer", () => {
	test("registra destinatario y asunto, nunca el cuerpo", async () => {
		const { logger, entries } = recordingLogger();

		await createLogMailer(logger).send(MESSAGE);

		expect(JSON.stringify(entries)).toContain("ana@instituto.gob.mx");
		expect(JSON.stringify(entries)).not.toContain("datos personales");
	});
});

describe("createMailerFromEnv", () => {
	test("sin SMTP_HOST usa el log", async () => {
		const { logger, entries } = recordingLogger();

		await createMailerFromEnv(
			{ SMTP_PORT: 587, SMTP_SECURE: "false" },
			logger,
		).send(MESSAGE);

		expect(entries).toHaveLength(1);
	});
});
