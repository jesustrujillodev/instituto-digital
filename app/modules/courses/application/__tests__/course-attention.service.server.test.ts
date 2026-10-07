import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import type { CourseScopeWhere } from "../../domain/course.access";
import { COURSE_ERROR_CODES } from "../../domain/course.errors";
import type { CourseAttentionItem } from "../../domain/course-attention.types";
import { createCourseAttentionService } from "../course-attention.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const itemOf = (documentId: string): CourseAttentionItem => ({
	documentId,
	title: `Curso ${documentId}`,
	updatedAt: new Date("2026-09-10T18:00:00.000Z"),
	firstSessionAt: null,
});

const createHarness = (
	rows:
		| { drafts?: CourseAttentionItem[]; withoutTrainer?: CourseAttentionItem[] }
		| Error = {},
) => {
	const calls = {
		drafts: [] as { filter: CourseScopeWhere; take: number }[],
		withoutTrainer: [] as { filter: CourseScopeWhere; take: number }[],
	};

	const courseAttentionRepository = {
		findDrafts: async (filter: CourseScopeWhere, take: number) => {
			calls.drafts.push({ filter, take });
			if (rows instanceof Error) throw rows;
			return rows.drafts ?? [];
		},
		findWithoutActiveTrainer: async (
			filter: CourseScopeWhere,
			take: number,
		) => {
			calls.withoutTrainer.push({ filter, take });
			if (rows instanceof Error) throw rows;
			return rows.withoutTrainer ?? [];
		},
	} as unknown as ICradle["courseAttentionRepository"];

	const service = createCourseAttentionService({
		courseAttentionRepository,
		logger: silentLogger,
	});

	return { service, calls };
};

describe("courseAttentionService.summarize", () => {
	test("lee los dos grupos con el filtro del alcance y uno de más", async () => {
		const { service, calls } = createHarness();

		await service.summarize(
			{ kind: "dependency", dependencyId: 3 },
			{ limit: 5 },
		);

		expect(calls.drafts).toEqual([{ filter: { dependencyId: 3 }, take: 6 }]);
		expect(calls.withoutTrainer).toEqual([
			{ filter: { dependencyId: 3 }, take: 6 },
		]);
	});

	test("el capacitador interno solo ve lo que creó", async () => {
		const { service, calls } = createHarness();

		await service.summarize(
			{ kind: "creator", dependencyId: 3, userId: 9 },
			{ limit: 5 },
		);

		expect(calls.drafts[0].filter).toEqual({ dependencyId: 3, createdById: 9 });
	});

	test("recorta al límite y avisa del recorte", async () => {
		const { service } = createHarness({
			drafts: [itemOf("a"), itemOf("b"), itemOf("c")],
			withoutTrainer: [itemOf("d")],
		});

		const result = await service.summarize(
			{ kind: "dependency", dependencyId: 3 },
			{ limit: 2 },
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				drafts: { courses: [itemOf("a"), itemOf("b")], truncated: true },
				withoutTrainer: { courses: [itemOf("d")], truncated: false },
			},
		});
	});

	test("sin alcance de cursos responde FORBIDDEN_SCOPE sin tocar la base", async () => {
		const { service, calls } = createHarness();

		const result = await service.summarize({ kind: "none" }, { limit: 5 });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(COURSE_ERROR_CODES.FORBIDDEN_SCOPE);
		expect(calls.drafts).toEqual([]);
	});

	test("un fallo del repositorio llega como error inesperado", async () => {
		const { service } = createHarness(new Error("connection refused"));

		const result = await service.summarize(
			{ kind: "dependency", dependencyId: 3 },
			{ limit: 5 },
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(RESPONSE_ERROR_CODES.UNEXPECTED);
	});
});
