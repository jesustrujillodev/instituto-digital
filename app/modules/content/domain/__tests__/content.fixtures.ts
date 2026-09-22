import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	ContentLesson,
	ContentModule,
	CourseContentTree,
} from "../content.types";

export const COURSE_DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const MODULE_A = "11111111-1111-4111-8111-111111111111";
export const MODULE_B = "22222222-2222-4222-8222-222222222222";
export const LESSON_1 = "33333333-3333-4333-8333-333333333333";
export const LESSON_2 = "44444444-4444-4444-8444-444444444444";
export const LESSON_3 = "55555555-5555-4555-8555-555555555555";
export const OTHER_DOC = "66666666-6666-4666-8666-666666666666";

export const lessonOf = (
	overrides: Partial<ContentLesson> = {},
): ContentLesson => ({
	documentId: LESSON_1,
	title: "Qué es la transparencia",
	type: "TEXT",
	order: 1,
	isRequired: true,
	estimatedMinutes: null,
	hasMaterial: false,
	...overrides,
});

export const moduleOf = (
	overrides: Partial<ContentModule> = {},
): ContentModule => ({
	documentId: MODULE_A,
	title: "Fundamentos",
	description: null,
	order: 1,
	lessons: [lessonOf()],
	...overrides,
});

/** Dos módulos: el primero con dos lecciones, el segundo con una. */
export const treeOf = (): CourseContentTree => [
	moduleOf({
		lessons: [
			lessonOf(),
			lessonOf({ documentId: LESSON_2, title: "Marco legal", order: 2 }),
		],
	}),
	moduleOf({
		documentId: MODULE_B,
		title: "Práctica",
		order: 2,
		lessons: [
			lessonOf({
				documentId: LESSON_3,
				title: "Caso guiado",
				order: 1,
				isRequired: false,
			}),
		],
	}),
];

export const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 99,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "titular@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});
