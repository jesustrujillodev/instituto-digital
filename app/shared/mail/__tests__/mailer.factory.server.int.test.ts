import { describe, expect, test } from "vitest";
import { env } from "@/core/env.server";
import type { Logger } from "@/shared/logging/logger";
import { createMailerFromEnv } from "../mailer.factory.server";
import { waitForMail } from "./mailpit.client";

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
} as unknown as Logger;

describe("mailer SMTP contra Mailpit", () => {
	test("entrega asunto, texto y html con el remitente de MAIL_FROM", async () => {
		const mailer = createMailerFromEnv(env, silentLogger);
		const to = `smtp-${Date.now().toString(36)}@idc.test`;

		await mailer.send({
			to,
			subject: "Tu cuenta en la plataforma",
			text: "Hola, ya puedes entrar.",
			html: "<p>Hola, ya puedes <strong>entrar</strong>.</p>",
		});

		const received = await waitForMail(to);
		expect(received.Subject).toBe("Tu cuenta en la plataforma");
		expect(received.From).toEqual({
			Name: "Instituto Digital",
			Address: "no-responder@idc.test",
		});
		expect(received.Text.trim()).toBe("Hola, ya puedes entrar.");
		expect(received.HTML).toContain("<strong>entrar</strong>");
	});

	test("un destinatario inválido no se entrega y el adaptador lanza", async () => {
		const mailer = createMailerFromEnv(env, silentLogger);

		await expect(
			mailer.send({ to: "sin-arroba", subject: "x", text: "x", html: "x" }),
		).rejects.toThrow();
	});
});
