import { toRouteError } from "@/shared/http/route-error";
import {
	parseInput,
	toResponseError,
} from "@/shared/response/response.helpers";
import { CourseNotFoundError } from "../domain/course.errors";
import { validateFindCourse } from "../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../utils/course-error-messages";

/** El `documentId` de la URL; uno malformado no nombra ningún curso: 404. */
export const requireCourseParam = (documentId: unknown): string => {
	const input = parseInput(() => validateFindCourse({ documentId }).documentId);
	if (!input.success) {
		throw toRouteError(
			toResponseError(new CourseNotFoundError()),
			COURSE_ERROR_MESSAGES,
		);
	}

	return input.data;
};
