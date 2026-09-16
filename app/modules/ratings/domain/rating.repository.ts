import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type {
	CourseRatingSummary,
	RatingEligibility,
	RatingWrite,
} from "./rating.types";

export interface IRatingRepository {
	/** `null` si el curso no existe. */
	findEligibility(
		courseDocumentId: string,
		userId: number,
	): Promise<RatingEligibility | null>;
	/** Lanza `RatingAlreadyRatedError` si la persona ya valoró el curso. */
	create(data: RatingWrite): Promise<void>;

	/** El id del curso si cumple el filtro de quien imparte u organiza. */
	findCourseId(
		documentId: string,
		where: TeachingCourseWhere,
	): Promise<number | null>;
	summarizeCourse(courseId: number): Promise<CourseRatingSummary>;
}
