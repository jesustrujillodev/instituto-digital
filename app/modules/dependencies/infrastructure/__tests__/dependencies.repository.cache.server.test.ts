import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { DEPENDENCIES_CACHE_SCOPE } from "../../domain/dependency.config";
import { createDependencyRepositoryWithInvalidation } from "../dependencies.repository.cache.server";

const DEPENDENCY = { documentId: "d1", name: "SEDESOL" };

const createHarness = (options: { failing?: boolean } = {}) => {
	const calls = { invalidated: [] as string[], deferred: 0 };
	const write = async () => {
		if (options.failing) throw new Error("duplicado");
		return DEPENDENCY;
	};
	const inner = {
		create: write,
		update: write,
		archive: write,
		unarchive: write,
		findCatalog: async () => [DEPENDENCY],
	} as unknown as ICradle["dependencyRepository"];
	const aggregateCache = {
		invalidate: async (scope: string) => {
			calls.invalidated.push(scope);
		},
	} as unknown as ICradle["aggregateCache"];
	const afterCommit: ICradle["afterCommit"] = async (task) => {
		calls.deferred += 1;
		await task();
	};

	return {
		repository: createDependencyRepositoryWithInvalidation({
			inner,
			aggregateCache,
			afterCommit,
		}),
		calls,
	};
};

describe("createDependencyRepositoryWithInvalidation", () => {
	test.each([
		["create", (r: ICradle["dependencyRepository"]) => r.create({} as never)],
		[
			"update",
			(r: ICradle["dependencyRepository"]) => r.update("d1", {} as never),
		],
		["archive", (r: ICradle["dependencyRepository"]) => r.archive("d1")],
		["unarchive", (r: ICradle["dependencyRepository"]) => r.unarchive("d1")],
	] as const)(
		"%s avisa tras el commit y devuelve lo escrito",
		async (_name, write) => {
			const { repository, calls } = createHarness();

			expect(await write(repository)).toEqual(DEPENDENCY);
			expect(calls.deferred).toBe(1);
			expect(calls.invalidated).toEqual([DEPENDENCIES_CACHE_SCOPE]);
		},
	);

	test("una escritura que falla no invalida", async () => {
		const { repository, calls } = createHarness({ failing: true });

		await expect(repository.archive("d1")).rejects.toThrow("duplicado");
		expect(calls.invalidated).toEqual([]);
	});

	test("las lecturas pasan tal cual", async () => {
		const { repository } = createHarness();

		expect(await repository.findCatalog()).toEqual([DEPENDENCY]);
	});
});
