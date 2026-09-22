import type { LessonType } from "./content.rules";
import type {
	ContentLesson,
	ContentModule,
	ContentSummary,
	CourseContentTree,
} from "./content.types";

export interface ContentLessonRaw {
	documentId: string;
	title: string;
	type: LessonType;
	order: number;
	isRequired: boolean;
	estimatedMinutes: number | null;
}

export interface ContentModuleRaw {
	documentId: string;
	title: string;
	description: string | null;
	order: number;
	lessons: readonly ContentLessonRaw[];
}

const toLesson = (raw: ContentLessonRaw): ContentLesson => ({
	documentId: raw.documentId,
	title: raw.title,
	type: raw.type,
	order: raw.order,
	isRequired: raw.isRequired,
	estimatedMinutes: raw.estimatedMinutes,
});

const toModule = (raw: ContentModuleRaw): ContentModule => ({
	documentId: raw.documentId,
	title: raw.title,
	description: raw.description,
	order: raw.order,
	lessons: raw.lessons.map(toLesson),
});

export const toCourseContentTree = (
	rows: readonly ContentModuleRaw[],
): CourseContentTree => rows.map(toModule);

export const toContentSummary = (tree: CourseContentTree): ContentSummary => {
	const lessons = tree.flatMap((module) => module.lessons);

	return {
		moduleCount: tree.length,
		lessonCount: lessons.length,
		requiredLessonCount: lessons.filter((lesson) => lesson.isRequired).length,
	};
};
