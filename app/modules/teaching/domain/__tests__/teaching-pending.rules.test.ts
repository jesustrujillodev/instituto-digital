import { describe, expect, test } from "vitest";
import type { PendingFinishRecord } from "../teaching.types";
import { toTeachingPending } from "../teaching-pending.rules";

const recordOf = (
	documentId: string,
	day: number,
	overrides: Partial<PendingFinishRecord> = {},
): PendingFinishRecord => ({
	documentId,
	title: documentId,
	dependencyId: 3,
	lastSessionEndsAt: new Date(Date.UTC(2026, 8, day, 20)),
	enrolledCount: 0,
	viewerTeaches: false,
	...overrides,
});

describe("toTeachingPending", () => {
	test("lo que lleva más tiempo esperando va primero", () => {
		const pending = toTeachingPending(
			[recordOf("b", 10), recordOf("a", 2), recordOf("c", 15)],
			{ dependencyId: 3 },
			5,
		);

		expect(pending.awaitingFinish.map((course) => course.documentId)).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(pending.truncated).toBe(false);
	});

	test("organiza solo lo de su dependencia; sin dependencia, nada", () => {
		const records = [
			recordOf("propio", 1),
			recordOf("ajeno", 2, { dependencyId: 8, viewerTeaches: true }),
		];

		expect(
			toTeachingPending(records, { dependencyId: 3 }, 5).awaitingFinish.map(
				({ organizing, teaching }) => ({ organizing, teaching }),
			),
		).toEqual([
			{ organizing: true, teaching: false },
			{ organizing: false, teaching: true },
		]);
		expect(
			toTeachingPending(
				records,
				{ dependencyId: null },
				5,
			).awaitingFinish.every((course) => !course.organizing),
		).toBe(true);
	});

	test("recorta al límite y avisa que había más", () => {
		const pending = toTeachingPending(
			[recordOf("a", 1), recordOf("b", 2), recordOf("c", 3)],
			{ dependencyId: 3 },
			2,
		);

		expect(pending.awaitingFinish).toHaveLength(2);
		expect(pending.truncated).toBe(true);
	});
});
