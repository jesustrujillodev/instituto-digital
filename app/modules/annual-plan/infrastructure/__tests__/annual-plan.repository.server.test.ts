import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { ANNUAL_PLAN_ERROR_CODES } from "../../domain/annual-plan.errors";
import { createAnnualPlanRepository } from "../annual-plan.repository.server";

const knownError = (code: string) =>
	new Prisma.PrismaClientKnownRequestError("falla", {
		code,
		clientVersion: "test",
	});

const createHarness = (
	options: { error?: Error; inTransaction?: boolean } = {},
) => {
	const log: string[] = [];
	const calls: Record<string, Record<string, unknown>[]> = {
		findMany: [],
		findFirst: [],
	};

	const repository = createAnnualPlanRepository({
		prisma: {
			$queryRaw: async (strings: TemplateStringsArray) => {
				log.push(`lock:${strings.join("?")}`);
				return [];
			},
			annualPlan: {
				findMany: async (args: Record<string, unknown>) => {
					calls.findMany.push(args);
					return [];
				},
				create: async () => {
					if (options.error) throw options.error;
					return { documentId: "p" };
				},
			},
			planLine: {
				findFirst: async (args: Record<string, unknown>) => {
					calls.findFirst.push(args);
					return null;
				},
				findUnique: async () => {
					log.push("read");
					return null;
				},
				delete: async () => {
					if (options.error) throw options.error;
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls, log };
};

describe("annualPlanRepository", () => {
	test("funde el alcance con los filtros al listar", async () => {
		const { repository, calls } = createHarness();

		await repository.findPlans(
			{ dependencyId: 3 },
			{ dependencyDocumentId: "dep-doc", fiscalYear: 2026 },
		);

		expect(calls.findMany[0]).toMatchObject({
			where: {
				AND: [
					{ dependencyId: 3 },
					{ dependency: { documentId: "dep-doc" } },
					{ fiscalYear: 2026 },
				],
			},
		});
	});

	test("desde un ejercicio trae ese y los siguientes", async () => {
		const { repository, calls } = createHarness();

		await repository.findPlans({}, { fromYear: 2026 });

		expect(calls.findMany[0]).toMatchObject({
			where: { AND: [{}, { fiscalYear: { gte: 2026 } }] },
		});
	});

	test("una línea se busca por el alcance de su plan", async () => {
		const { repository, calls } = createHarness();

		await repository.findLine("line-doc", { id: { in: [] } });

		expect(calls.findFirst[0]).toMatchObject({
			where: { documentId: "line-doc", plan: { id: { in: [] } } },
		});
	});

	test("bloquea la fila de la línea antes de releerla", async () => {
		const { repository, log } = createHarness();

		await repository.lockLineForCourse("line-doc");

		expect(log[0]).toContain('FROM "org"."plan_lines"');
		expect(log[0]).toContain("FOR UPDATE");
		expect(log[1]).toBe("read");
	});

	test("traduce la unicidad y la FK a códigos del dominio", async () => {
		const duplicate = await createHarness({ error: knownError("P2002") })
			.repository.createPlan({
				dependencyId: 3,
				fiscalYear: 2026,
				createdById: 2,
			})
			.catch((error) => error);
		const referenced = await createHarness({ error: knownError("P2003") })
			.repository.deleteLine(21)
			.catch((error) => error);

		expect(duplicate.code).toBe(ANNUAL_PLAN_ERROR_CODES.ALREADY_EXISTS);
		expect(referenced.code).toBe(ANNUAL_PLAN_ERROR_CODES.LINE_HAS_COURSES);
	});
});
