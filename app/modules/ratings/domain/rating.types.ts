import type * as v from "valibot";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type { rateCourseRule } from "./rating.rules";

export type RateCourseDto = v.InferOutput<typeof rateCourseRule>;

/** Lo que decide si una persona puede valorar un curso. */
export interface RatingEligibility {
	courseId: number;
	courseStatus: CourseStatus;
	courseFormat: CourseFormat;
	enrollmentStatus: EnrollmentStatus | null;
	attendedSessions: number;
	completed: boolean;
	alreadyRated: boolean;
}

export interface RatingWrite {
	courseId: number;
	userId: number;
	score: number;
	comment: string | null;
}

/** Sin autor: los comentarios se muestran anónimos para todos (§6.10). */
export interface RatingComment {
	score: number;
	comment: string;
	createdAt: Date;
}

export interface CourseRatingSummary {
	/** `null` sin valoraciones: un cero mentiría. */
	average: number | null;
	count: number;
	comments: RatingComment[];
}

export type RatingMutationResponse = AppResponse<null>;
export type CourseRatingSummaryResponse = AppResponse<CourseRatingSummary>;
