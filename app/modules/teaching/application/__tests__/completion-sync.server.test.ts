import { describe, expect, test } from "vitest";
import type {
	CreditCandidate,
	CreditWriteContext,
	StoredCredit,
} from "@/modules/credits/domain/credit.types";
import type { ICradle } from "@/shared/di/container.types";
import {
	courseOf,
	LUIS_DOC,
	participantOf,
} from "../../domain/__tests__/teaching.fixtures";
import type { TeachingCourse } from "../../domain/teaching.types";
import { createCompletionSync } from "../completion-sync.server";

const DONE = new Date("2027-03-10T18:00:00.000Z");
const AT = new Date("2027-03-18T16:00:00.000Z");

const createHarness = (course: TeachingCourse, stored: StoredCredit[] = []) => {
	const calls = {
		completion: [] as number[][],
		grants: [] as {
			candidates: CreditCandidate[];
			context: CreditWriteContext;
		}[],
		revoked: [] as number[][],
	};

	const sync = createCompletionSync({
		teachingRepository: {
			findCourseById: async () => structuredClone(course),
		} as unknown as ICradle["teachingRepository"],
		enrollmentRepository: {
			setCompletion: async (_courseId: number, userIds: number[]) => {
				calls.completion.push([...userIds]);
			},
		} as unknown as ICradle["enrollmentRepository"],
		creditRepository: {
			findByCourse: async () => stored,
			grant: async (
				candidates: CreditCandidate[],
				context: CreditWriteContext,
			) => {
				if (candidates.length > 0) calls.grants.push({ candidates, context });
			},
			restore: async () => {},
			revoke: async (userIds: number[]) => {
				if (userIds.length > 0) calls.revoked.push([...userIds]);
			},
		} as unknown as ICradle["creditRepository"],
	});

	return { sync, calls };
};

describe("completionSync", () => {
	// Un autogestivo no tiene última sesión: su ejercicio es el del momento en
	// que la persona completa (docs/adr/0014).
	test("un autogestivo acredita el año en que se completa", async () => {
		const { sync, calls } = createHarness(
			courseOf({
				format: "SELF_PACED",
				completionRule: "CONTENT",
				sessions: [],
				participants: [
					participantOf({ contentCompletedAt: DONE }),
					participantOf({ userId: 51, userDocumentId: LUIS_DOC }),
				],
			}),
		);

		const result = await sync.sync(10, 50, AT);

		expect(result.completed).toBe(1);
		expect(calls.completion).toEqual([[50]]);
		expect(calls.grants).toEqual([
			{
				candidates: [{ userId: 50, dependencyId: 3 }],
				context: { courseId: 10, fiscalYear: 2027, at: AT, actorId: 50 },
			},
		]);
	});

	test("retira el crédito de quien deja de cumplir", async () => {
		const { sync, calls } = createHarness(
			courseOf({ participants: [participantOf()] }),
			[{ userId: 50, dependencyId: 3, revokedAt: null }],
		);

		await sync.sync(10, 2, AT);

		expect(calls.completion).toEqual([[]]);
		expect(calls.revoked).toEqual([[50]]);
	});
});
