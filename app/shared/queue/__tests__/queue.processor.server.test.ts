import { UnrecoverableError } from "bullmq";
import { describe, expect, test } from "vitest";
import { JOB_NAMES, QUEUE_NAMES } from "../queue.config";
import {
	createJobProcessor,
	isFinalFailure,
	type JobLike,
	toFailureRecord,
} from "../queue.processor.server";
import { createHandlersDouble } from "./job-handlers.double";

const jobOf = (overrides: Partial<JobLike> = {}): JobLike => ({
	id: "12",
	name: JOB_NAMES.deleteObject,
	queueName: QUEUE_NAMES.storage,
	data: { bucket: "instituto", key: "cursos/portada.png" },
	attemptsMade: 1,
	opts: { attempts: 5 },
	...overrides,
});

describe("createJobProcessor", () => {
	test("valida el payload y lo entrega a su handler", async () => {
		const { handlers, ran } = createHandlersDouble();

		await createJobProcessor(handlers)(jobOf());

		expect(ran).toEqual([JOB_NAMES.deleteObject]);
	});

	// Reintentar no arregla un trabajo que no se entiende.
	test("un nombre desconocido es un fallo definitivo", async () => {
		const { handlers } = createHandlersDouble();

		await expect(
			createJobProcessor(handlers)(jobOf({ name: "compress-video" })),
		).rejects.toBeInstanceOf(UnrecoverableError);
	});

	test("un payload que no cumple es un fallo definitivo", async () => {
		const { handlers, ran } = createHandlersDouble();

		await expect(
			createJobProcessor(handlers)(jobOf({ data: { key: "" } })),
		).rejects.toBeInstanceOf(UnrecoverableError);
		expect(ran).toEqual([]);
	});
});

describe("isFinalFailure", () => {
	test("solo al agotar los intentos o con un error irrecuperable", () => {
		const error = new Error("timeout");

		expect(isFinalFailure(jobOf({ attemptsMade: 4 }), error)).toBe(false);
		expect(isFinalFailure(jobOf({ attemptsMade: 5 }), error)).toBe(true);
		expect(
			isFinalFailure(jobOf({ attemptsMade: 1 }), new UnrecoverableError("x")),
		).toBe(true);
	});
});

describe("toFailureRecord", () => {
	test("guarda cola, nombre, payload, error e intentos", () => {
		const error = new Error("403 Forbidden");

		expect(toFailureRecord(jobOf({ attemptsMade: 5 }), error)).toMatchObject({
			queue: QUEUE_NAMES.storage,
			name: JOB_NAMES.deleteObject,
			jobId: "12",
			payload: { bucket: "instituto", key: "cursos/portada.png" },
			attempts: 5,
		});
	});

	test("un intento que todavía se reintenta no se guarda", () => {
		expect(toFailureRecord(jobOf(), new Error("timeout"))).toBeNull();
	});

	// Su fila FAILED del outbox ya es el registro, y el barrido la reencola.
	test("el correo nunca va a job_failure", () => {
		const job = jobOf({
			name: JOB_NAMES.deliverEmail,
			queueName: QUEUE_NAMES.emails,
			opts: { attempts: 1 },
		});

		expect(toFailureRecord(job, new Error("db caída"))).toBeNull();
	});
});
