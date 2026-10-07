import { describe, expect, test } from "vitest";
import { JOB_NAMES } from "../queue.config";
import { isJobName, parseJobPayload } from "../queue.payloads";

describe("parseJobPayload", () => {
	test("acepta un recálculo con ids y fecha ISO", () => {
		const payload = {
			courseId: 7,
			actorId: 3,
			at: "2026-10-06T18:00:00.000Z",
		};

		expect(parseJobPayload(JOB_NAMES.recalculateProgress, payload)).toEqual(
			payload,
		);
	});

	test.each([
		[JOB_NAMES.deliverEmail, { outboxId: 0, attempt: 0 }],
		[JOB_NAMES.recalculateProgress, { courseId: 7, actorId: 3, at: "ayer" }],
		[JOB_NAMES.deleteObject, { bucket: "", key: "a.pdf" }],
	] as const)("rechaza un payload de %s que no cumple", (name, payload) => {
		expect(() => parseJobPayload(name, payload)).toThrow();
	});
});

describe("isJobName", () => {
	test("reconoce solo los trabajos declarados", () => {
		expect(isJobName(JOB_NAMES.deleteObject)).toBe(true);
		expect(isJobName("toString")).toBe(false);
		expect(isJobName("compress-video")).toBe(false);
	});
});
