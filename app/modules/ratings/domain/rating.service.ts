import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CourseRatingSummaryResponse,
	RateCourseDto,
	RatingMutationResponse,
} from "./rating.types";

export interface IRatingService {
	rate(
		courseDocumentId: string,
		dto: RateCourseDto,
		actor: AuthContext,
	): Promise<RatingMutationResponse>;
	/**
	 * Promedio, número y comentarios anónimos. Lo ven la dependencia
	 * organizadora, los capacitadores del curso y el alcance global (§3).
	 */
	findCourseSummary(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<CourseRatingSummaryResponse>;
}
