import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { canParticipate } from "@/modules/enrollments/domain/enrollment.rules";
import {
	canTeach,
	resolveTeachingScope,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	RatingAlreadyRatedError,
	RatingCourseNotFoundError,
	RatingNotEligibleError,
} from "../domain/rating.errors";
import { canRateCourse } from "../domain/rating.rules";
import type { IRatingService } from "../domain/rating.service";
import type { RateCourseDto } from "../domain/rating.types";

type Dependencies = {
	ratingRepository: ICradle["ratingRepository"];
	logger: ICradle["logger"];
};

export const createRatingService = ({
	ratingRepository,
	logger,
}: Dependencies): IRatingService => {
	const run = createOperationRunner(logger.child({ module: "ratings" }));

	return {
		async rate(
			courseDocumentId: string,
			dto: RateCourseDto,
			actor: AuthContext,
		) {
			return run("rate", async () => {
				if (!canParticipate(actor)) throw new RatingNotEligibleError();

				const eligibility = await ratingRepository.findEligibility(
					courseDocumentId,
					actor.userId,
				);
				if (!eligibility) throw new RatingCourseNotFoundError();
				if (!canRateCourse(eligibility)) throw new RatingNotEligibleError();
				if (eligibility.alreadyRated) throw new RatingAlreadyRatedError();

				await ratingRepository.create({
					courseId: eligibility.courseId,
					userId: actor.userId,
					score: dto.score,
					comment: dto.comment,
				});

				return ok(null);
			});
		},

		async findCourseSummary(courseDocumentId: string, actor: AuthContext) {
			return run("findCourseSummary", async () => {
				const scope = resolveTeachingScope(actor);
				const courseId = canTeach(scope)
					? await ratingRepository.findCourseId(
							courseDocumentId,
							teachingCourseWhere(scope),
						)
					: null;
				if (courseId === null) throw new RatingCourseNotFoundError();

				return ok(await ratingRepository.summarizeCourse(courseId));
			});
		},
	};
};
