import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import {
	CREDITS_CACHE_SCOPE,
	CREDITS_SUMMARY_CACHE,
} from "../../domain/credit.config";
import type { DependencyCreditRow } from "../../domain/credit.types";
import { createCachedCreditRepository } from "../credits.repository.cache.server";

const ROWS: DependencyCreditRow[] = [
	{ dependencyDocumentId: "d1", name: "SEDESOL", credits: 4, people: 3 },
];

const CONTEXT = { courseId: 1, fiscalYear: 2026, at: new Date(), actorId: 9 };

const createHarness = () => {
	const calls = {
		reads: [] as { name: string; key: string; dependsOn: readonly string[] }[],
		invalidated: [] as string[],
		deferred: 0,
		writes: [] as string[],
	};
	const inner = {
		summarizeByDependency: async () => ROWS,
		grant: async () => {
			calls.writes.push("grant");
		},
		restore: async () => {
			calls.writes.push("restore");
		},
		revoke: async () => {
			calls.writes.push("revoke");
		},
		findMine: async () => [],
	} as unknown as ICradle["creditRepository"];
	const aggregateCache = {
		getOrCompute: async (
			read: { name: string; key: string; dependsOn: readonly string[] },
			compute: () => Promise<unknown>,
		) => {
			calls.reads.push(read);
			return compute();
		},
		invalidate: async (scope: string) => {
			calls.invalidated.push(scope);
		},
	} as unknown as ICradle["aggregateCache"];
	const afterCommit: ICradle["afterCommit"] = async (task) => {
		calls.deferred += 1;
		await task();
	};

	return {
		repository: createCachedCreditRepository({
			inner,
			aggregateCache,
			afterCommit,
		}),
		calls,
	};
};

describe("createCachedCreditRepository", () => {
	test("el resumen se pide por ejercicio y depende de créditos y dependencias", async () => {
		const { repository, calls } = createHarness();

		const rows = await repository.summarizeByDependency(2026);

		expect(rows).toEqual(ROWS);
		expect(calls.reads).toEqual([
			expect.objectContaining({
				name: CREDITS_SUMMARY_CACHE.name,
				key: "2026",
				dependsOn: [CREDITS_CACHE_SCOPE, "dependencies"],
			}),
		]);
	});

	test.each([
		[
			"grant",
			(r: ICradle["creditRepository"]) =>
				r.grant([{ userId: 1, dependencyId: 2 }] as never, CONTEXT),
		],
		["restore", (r: ICradle["creditRepository"]) => r.restore([1], CONTEXT)],
		["revoke", (r: ICradle["creditRepository"]) => r.revoke([1], CONTEXT)],
	] as const)("%s invalida tras el commit", async (name, write) => {
		const { repository, calls } = createHarness();

		await write(repository);

		expect(calls.writes).toEqual([name]);
		expect(calls.deferred).toBe(1);
		expect(calls.invalidated).toEqual([CREDITS_CACHE_SCOPE]);
	});

	// La sincronización de un curso llama a las tres aunque no cambie nada.
	test("un lote vacío no invalida", async () => {
		const { repository, calls } = createHarness();

		await repository.grant([], CONTEXT);
		await repository.restore([], CONTEXT);
		await repository.revoke([], CONTEXT);

		expect(calls.invalidated).toEqual([]);
	});

	test("lo demás pasa tal cual al repositorio", async () => {
		const { repository } = createHarness();

		expect(await repository.findMine(7)).toEqual([]);
	});
});
