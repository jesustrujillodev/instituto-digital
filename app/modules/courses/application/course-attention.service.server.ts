import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { type CourseScope, courseScopeWhere } from "../domain/course.access";
import { CourseForbiddenScopeError } from "../domain/course.errors";
import type { ICourseAttentionService } from "../domain/course-attention.service";
import type {
	CourseAttentionItem,
	CourseAttentionList,
} from "../domain/course-attention.types";

type Dependencies = {
	courseAttentionRepository: ICradle["courseAttentionRepository"];
	logger: ICradle["logger"];
};

/** Se lee uno de más para saber si hubo recorte sin un conteo aparte. */
const toList = (
	rows: CourseAttentionItem[],
	limit: number,
): CourseAttentionList => ({
	courses: rows.slice(0, limit),
	truncated: rows.length > limit,
});

export const createCourseAttentionService = ({
	courseAttentionRepository,
	logger,
}: Dependencies): ICourseAttentionService => {
	const run = createOperationRunner(logger.child({ module: "courses" }));

	return {
		async summarize(scope: CourseScope, { limit }: { limit: number }) {
			return run("summarizeAttention", async () => {
				if (scope.kind === "none") throw new CourseForbiddenScopeError();

				const filter = courseScopeWhere(scope);
				const [drafts, withoutTrainer] = await Promise.all([
					courseAttentionRepository.findDrafts(filter, limit + 1),
					courseAttentionRepository.findWithoutActiveTrainer(filter, limit + 1),
				]);

				return ok({
					drafts: toList(drafts, limit),
					withoutTrainer: toList(withoutTrainer, limit),
				});
			});
		},
	};
};
