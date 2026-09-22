import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	type CourseScope,
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import { canEdit } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	ContentCourseNotEditableError,
	ContentCourseNotFoundError,
	ContentLessonNotFoundError,
	ContentModuleNotFoundError,
} from "../domain/content.errors";
import {
	toContentSummary,
	toCourseContentTree,
} from "../domain/content.mapper";
import {
	assertLessonLimit,
	assertModuleArchivable,
	assertModuleLimit,
	nextOrderOf,
	resolveArchiveOrder,
	resolveContentOrder,
} from "../domain/content.rules";
import type { IContentService } from "../domain/content.service";
import type {
	ContentCourseRef,
	CreateLessonDto,
	CreateModuleDto,
	ReorderContentDto,
	UpdateLessonDto,
	UpdateModuleDto,
} from "../domain/content.types";

type Dependencies = {
	contentRepository: ICradle["contentRepository"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createContentService = ({
	contentRepository,
	runInTransaction,
	clock,
	logger,
}: Dependencies): IContentService => {
	const run = createOperationRunner(logger.child({ module: "content" }));

	/**
	 * Fuera de alcance responde igual que inexistente: quien no administra el
	 * curso no confirma por URL que exista.
	 */
	const requireCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentCourseRef> => {
		const scope: CourseScope = resolveCourseScope(actor);
		const where = courseScopeWriteWhere(scope);
		if (!where) throw new ContentCourseNotFoundError();

		const course = await contentRepository.findCourse(courseDocumentId, where);
		if (!course) throw new ContentCourseNotFoundError();
		return course;
	};

	/** El temario solo cambia mientras el curso admite edición. */
	const requireEditableCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentCourseRef> => {
		const course = await requireCourse(courseDocumentId, actor);
		if (!canEdit(course.status)) {
			throw new ContentCourseNotEditableError(course.status);
		}
		return course;
	};

	const requireModule = async (courseId: number, moduleDocumentId: string) => {
		const module = await contentRepository.findModule(
			courseId,
			moduleDocumentId,
		);
		if (!module) throw new ContentModuleNotFoundError();
		return module;
	};

	const requireLesson = async (courseId: number, lessonDocumentId: string) => {
		const lesson = await contentRepository.findLesson(
			courseId,
			lessonDocumentId,
		);
		if (!lesson) throw new ContentLessonNotFoundError();
		return lesson;
	};

	const readTree = async (courseId: number) =>
		toCourseContentTree(await contentRepository.findTree(courseId));

	return {
		async findTree(courseDocumentId: string, actor: AuthContext) {
			return run("findTree", async () => {
				const course = await requireCourse(courseDocumentId, actor);

				return ok(await readTree(course.id));
			});
		},
		async summarize(courseDocumentId: string, actor: AuthContext) {
			return run("summarize", async () => {
				const course = await requireCourse(courseDocumentId, actor);

				return ok(toContentSummary(await readTree(course.id)));
			});
		},
		async createModule(
			courseDocumentId: string,
			dto: CreateModuleDto,
			actor: AuthContext,
		) {
			return run("createModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const siblings = await contentRepository.findModuleSiblings(course.id);
				assertModuleLimit(siblings.length);

				await contentRepository.createModule(course.id, {
					title: dto.title,
					description: dto.description,
					order: nextOrderOf(siblings),
				});

				return ok(null);
			});
		},
		async updateModule(
			courseDocumentId: string,
			dto: UpdateModuleDto,
			actor: AuthContext,
		) {
			return run("updateModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const module = await requireModule(course.id, dto.moduleDocumentId);

				await contentRepository.updateModule(module.id, {
					title: dto.title,
					description: dto.description,
				});

				return ok(null);
			});
		},
		async archiveModule(
			courseDocumentId: string,
			moduleDocumentId: string,
			actor: AuthContext,
		) {
			return run("archiveModule", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const module = await requireModule(course.id, moduleDocumentId);
				assertModuleArchivable(module.activeLessons);

				const siblings = await contentRepository.findModuleSiblings(course.id);

				await runInTransaction(() =>
					contentRepository.archiveModule(
						module.id,
						clock.now(),
						resolveArchiveOrder(moduleDocumentId, siblings),
					),
				);

				return ok(null);
			});
		},
		async createLesson(
			courseDocumentId: string,
			dto: CreateLessonDto,
			actor: AuthContext,
		) {
			return run("createLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const module = await requireModule(course.id, dto.moduleDocumentId);
				const siblings = await contentRepository.findLessonSiblings(module.id);
				assertLessonLimit(siblings.length);

				await contentRepository.createLesson(module.id, {
					title: dto.title,
					type: dto.type,
					isRequired: dto.isRequired,
					estimatedMinutes: dto.estimatedMinutes,
					order: nextOrderOf(siblings),
				});

				return ok(null);
			});
		},
		async updateLesson(
			courseDocumentId: string,
			dto: UpdateLessonDto,
			actor: AuthContext,
		) {
			return run("updateLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const lesson = await requireLesson(course.id, dto.lessonDocumentId);

				await contentRepository.updateLesson(lesson.id, {
					title: dto.title,
					type: dto.type,
					isRequired: dto.isRequired,
					estimatedMinutes: dto.estimatedMinutes,
				});

				return ok(null);
			});
		},
		async archiveLesson(
			courseDocumentId: string,
			lessonDocumentId: string,
			actor: AuthContext,
		) {
			return run("archiveLesson", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const lesson = await requireLesson(course.id, lessonDocumentId);
				const siblings = await contentRepository.findLessonSiblings(
					lesson.moduleId,
				);

				await runInTransaction(() =>
					contentRepository.archiveLesson(
						lesson.id,
						clock.now(),
						resolveArchiveOrder(lessonDocumentId, siblings),
					),
				);

				return ok(null);
			});
		},
		async reorder(
			courseDocumentId: string,
			dto: ReorderContentDto,
			actor: AuthContext,
		) {
			return run("reorder", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const writes = resolveContentOrder(await readTree(course.id), dto);

				await runInTransaction(() => contentRepository.saveOrder(writes));

				return ok(null);
			});
		},
	};
};
