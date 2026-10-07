import { describe, expect, test } from "vitest";
import {
	JOB_NAMES,
	MAINTENANCE_SCHEDULES,
	QUEUE_DEFAULTS,
	QUEUE_NAMES,
	QUEUE_OF,
} from "../queue.config";
import { JOB_PAYLOAD_SCHEMAS } from "../queue.payloads";

describe("queue.config", () => {
	test("todo trabajo tiene cola y esquema de payload", () => {
		for (const name of Object.values(JOB_NAMES)) {
			expect(Object.values(QUEUE_NAMES)).toContain(QUEUE_OF[name]);
			expect(JOB_PAYLOAD_SCHEMAS[name]).toBeDefined();
		}
	});

	// El horario de reintentos del correo es el de su fila en el outbox: si
	// BullMQ también reintentara, habría dos relojes para el mismo mensaje.
	test("el correo se intenta una sola vez en la cola", () => {
		expect(QUEUE_DEFAULTS[QUEUE_NAMES.emails].attempts).toBe(1);
	});

	test("ninguna cola guarda sus trabajos para siempre", () => {
		for (const defaults of Object.values(QUEUE_DEFAULTS)) {
			expect(defaults.removeOnComplete).toEqual({ age: expect.any(Number) });
			expect(defaults.removeOnFail).toEqual({ age: expect.any(Number) });
		}
	});

	test("el mantenimiento solo programa trabajos de su cola", () => {
		for (const { name } of MAINTENANCE_SCHEDULES) {
			expect(QUEUE_OF[name]).toBe(QUEUE_NAMES.maintenance);
		}
	});
});
