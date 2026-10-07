import { describe, expect, test } from "vitest";
import { JOB_NAMES, PROGRESS_RECALC_DELAY_MS } from "../queue.config";
import { jobAddOptions, outboxJobId } from "../queue.job-options";

describe("outboxJobId", () => {
	test("es determinista por fila e intento, sin `:`", () => {
		expect(outboxJobId(42, 0)).toBe("outbox-42-0");
		expect(outboxJobId(42, 1)).not.toBe(outboxJobId(42, 0));
		expect(outboxJobId(42, 3)).not.toContain(":");
	});
});

describe("jobAddOptions", () => {
	test("la entrega de correo lleva el jobId de su fila", () => {
		expect(
			jobAddOptions(JOB_NAMES.deliverEmail, { outboxId: 9, attempt: 2 }),
		).toEqual({ jobId: "outbox-9-2" });
	});

	test("el recálculo se agrupa por curso y espera a que paren las ediciones", () => {
		const options = jobAddOptions(JOB_NAMES.recalculateProgress, {
			courseId: 7,
			actorId: 3,
			at: "2026-10-06T18:00:00.000Z",
		});

		expect(options).toEqual({
			delay: PROGRESS_RECALC_DELAY_MS,
			deduplication: { id: "course-7", replace: true, keepLastIfActive: true },
		});
	});

	test("el borrado no se deduplica: cada objeto es distinto", () => {
		expect(
			jobAddOptions(JOB_NAMES.deleteObject, { bucket: "b", key: "k" }),
		).toEqual({});
	});
});
