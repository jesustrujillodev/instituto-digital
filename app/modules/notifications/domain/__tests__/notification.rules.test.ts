import { describe, expect, test } from "vitest";
import { toOutboxMessage } from "../notification.mapper";
import {
	describeSendError,
	nextAttemptAfter,
	purgeCutoff,
} from "../notification.rules";
import { isDeliverable } from "../notification.validators";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const minutesLater = (minutes: number) =>
	new Date(NOW.getTime() + minutes * 60 * 1000);

describe("nextAttemptAfter", () => {
	test("espera cada vez más entre reintentos", () => {
		expect(nextAttemptAfter(1, NOW)).toEqual(minutesLater(1));
		expect(nextAttemptAfter(2, NOW)).toEqual(minutesLater(5));
		expect(nextAttemptAfter(5, NOW)).toEqual(minutesLater(720));
	});

	test("tras agotar los reintentos devuelve null", () => {
		expect(nextAttemptAfter(6, NOW)).toBeNull();
	});
});

describe("purgeCutoff", () => {
	test("conserva los enviados de los últimos 30 días", () => {
		expect(purgeCutoff(NOW)).toEqual(new Date("2026-08-17T18:00:00.000Z"));
	});
});

describe("describeSendError", () => {
	test("recorta el mensaje y no guarda el stack", () => {
		const error = new Error("x".repeat(900));

		expect(describeSendError(error)).toHaveLength(500);
		expect(describeSendError("texto")).toBe("texto");
	});
});

describe("isDeliverable", () => {
	test("descarta correos vacíos o mal formados", () => {
		expect(isDeliverable({ email: "ana@instituto.gob.mx" })).toBe(true);
		expect(isDeliverable({ email: "" })).toBe(false);
		expect(isDeliverable({ email: "no-es-correo" })).toBe(false);
	});
});

describe("toOutboxMessage", () => {
	test("toma el destinatario del evento y conserva la plantilla", () => {
		expect(
			toOutboxMessage(
				{
					template: "PASSWORD_RESET",
					to: {
						email: " ana@instituto.gob.mx ",
						firstName: null,
						lastName: null,
					},
				},
				{ subject: "s", text: "t", html: "h" },
			),
		).toEqual({
			template: "PASSWORD_RESET",
			recipient: "ana@instituto.gob.mx",
			subject: "s",
			text: "t",
			html: "h",
		});
	});
});
