import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	courseScopeWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { OPEN_ENROLLMENT_SCAN_CAP } from "../domain/enrollment.config";
import {
	EnrollmentForbiddenScopeError,
	EnrollmentNotEligibleError,
} from "../domain/enrollment.errors";
import { canParticipate } from "../domain/enrollment.rules";
import type { IEnrollmentSummaryService } from "../domain/enrollment-summary.service";
import type { MyCoursesDigestLimits } from "../domain/enrollment-summary.types";
import { bucketMyCourses, toMyCoursesDigest } from "../domain/my-courses.rules";
import { toOpenEnrollmentSummary } from "../domain/open-enrollment.rules";

type Dependencies = {
	enrollmentRepository: ICradle["enrollmentRepository"];
	enrollmentSummaryRepository: ICradle["enrollmentSummaryRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createEnrollmentSummaryService = ({
	enrollmentRepository,
	enrollmentSummaryRepository,
	clock,
	logger,
}: Dependencies): IEnrollmentSummaryService => {
	const run = createOperationRunner(logger.child({ module: "enrollments" }));

	return {
		async summarizeMine(actor: AuthContext, limits: MyCoursesDigestLimits) {
			return run("summarizeMine", async () => {
				if (!canParticipate(actor)) throw new EnrollmentNotEligibleError();

				const now = clock.now();
				const records = await enrollmentRepository.findMine(actor.userId);

				return ok(
					toMyCoursesDigest(bucketMyCourses(records, now), now, limits),
				);
			});
		},

		async summarizeOpen(actor: AuthContext, { limit }: { limit: number }) {
			return run("summarizeOpen", async () => {
				const scope = resolveCourseScope(actor);
				if (scope.kind === "none") throw new EnrollmentForbiddenScopeError();

				const now = clock.now();
				const records = await enrollmentSummaryRepository.findOpenCourses({
					filter: courseScopeWhere(scope),
					now,
					take: OPEN_ENROLLMENT_SCAN_CAP,
				});

				return ok(toOpenEnrollmentSummary(records, now, limit));
			});
		},
	};
};
