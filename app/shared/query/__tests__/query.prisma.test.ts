import { describe, expect, test } from "vitest";
import {
	toPrismaArgs,
	toPrismaOrderBy,
	toPrismaPage,
	toPrismaWhere,
} from "../query.prisma";
import type {
	FilterOperator,
	ValidatedLeaf,
	ValidatedNode,
} from "../query.types";

const leaf = (
	operator: FilterOperator,
	values: unknown[],
	path = "year",
): ValidatedLeaf => ({ field: "year", path, operator, values });

/** Extrae la única condición de un `where` de una sola hoja. */
const conditionOf = (node: ValidatedNode): unknown => {
	const where = toPrismaWhere([node]) as { AND: Record<string, unknown>[] };
	return where.AND[0].year;
};

describe("toPrismaWhere — operators", () => {
	test.each([
		["$eq", [2020], { equals: 2020 }],
		["$ne", [2020], { not: 2020 }],
		["$lt", [2020], { lt: 2020 }],
		["$lte", [2020], { lte: 2020 }],
		["$gt", [2020], { gt: 2020 }],
		["$gte", [2020], { gte: 2020 }],
		["$in", [2020, 2021], { in: [2020, 2021] }],
		["$notIn", [2020], { notIn: [2020] }],
		["$between", [2020, 2024], { gte: 2020, lte: 2024 }],
	] as const)("maps %s", (operator, values, expected) => {
		expect(conditionOf(leaf(operator, [...values]))).toEqual(expected);
	});

	test.each([
		["$contains", { contains: "rav", mode: "insensitive" }],
		["$startsWith", { startsWith: "rav", mode: "insensitive" }],
		["$endsWith", { endsWith: "rav", mode: "insensitive" }],
		["$notContains", { not: { contains: "rav", mode: "insensitive" } }],
	] as const)("maps %s case-insensitively", (operator, expected) => {
		expect(conditionOf(leaf(operator, ["rav"]))).toEqual(expected);
	});

	test("maps $null in both directions", () => {
		expect(conditionOf(leaf("$null", [true]))).toEqual({ equals: null });
		expect(conditionOf(leaf("$null", [false]))).toEqual({ not: null });
	});

	test("maps $notNull in both directions", () => {
		expect(conditionOf(leaf("$notNull", [true]))).toEqual({ not: null });
		expect(conditionOf(leaf("$notNull", [false]))).toEqual({ equals: null });
	});

	// `{ equals: … }` y no el atajo `{ campo: valor }`: el atajo cambia de
	// significado dentro de una relacion, y la misma funcion sirve para ambas.
	test("uses the explicit equals form so relations behave", () => {
		const where = toPrismaWhere([leaf("$eq", ["cursos"], "brand.slug")]);

		expect(where).toEqual({ AND: [{ brand: { slug: { equals: "cursos" } } }] });
	});
});

describe("toPrismaWhere — custom conditions", () => {
	test("uses the leaf override instead of nesting its path", () => {
		const where = toPrismaWhere([
			{
				...leaf("$contains", ["rav"], "ignored"),
				override: { OR: [{ brand: { name: { contains: "rav" } } }] },
			},
		]);

		expect(where).toEqual({
			AND: [{ OR: [{ brand: { name: { contains: "rav" } } }] }],
		});
	});
});

describe("toPrismaWhere — shape", () => {
	test("nests a dotted path one level per segment", () => {
		const where = toPrismaWhere([leaf("$eq", ["x"], "a.b.c")]);

		expect(where).toEqual({ AND: [{ a: { b: { c: { equals: "x" } } } }] });
	});

	// Fundir las condiciones en un solo objeto parece mas limpio hasta que llegan
	// $gte y $lte sobre el mismo campo: comparten clave y la segunda borraria a la
	// primera, dejando un rango abierto sin que nada avise.
	test("keeps two conditions on the same path from clobbering each other", () => {
		const where = toPrismaWhere([
			leaf("$gte", [2020]),
			leaf("$lte", [2024]),
		]) as { AND: unknown[] };

		expect(where.AND).toEqual([
			{ year: { gte: 2020 } },
			{ year: { lte: 2024 } },
		]);
	});

	test("returns undefined — not an empty object — when there are no filters", () => {
		expect(toPrismaWhere([])).toBeUndefined();
	});

	test("maps $or and $and groups to their Prisma keys", () => {
		const where = toPrismaWhere([
			{ operator: "$or", children: [leaf("$eq", [2020]), leaf("$eq", [2021])] },
		]);

		expect(where).toEqual({
			AND: [{ OR: [{ year: { equals: 2020 } }, { year: { equals: 2021 } }] }],
		});
	});

	test("nests groups inside groups", () => {
		const where = toPrismaWhere([
			{
				operator: "$and",
				children: [{ operator: "$or", children: [leaf("$eq", [2020])] }],
			},
		]);

		expect(where).toEqual({
			AND: [{ AND: [{ OR: [{ year: { equals: 2020 } }] }] }],
		});
	});
});

describe("toPrismaOrderBy", () => {
	test("emits a list so the field order survives", () => {
		expect(
			toPrismaOrderBy([
				{ field: "brand", direction: "asc", path: "brand.name" },
				{ field: "year", direction: "desc", path: "year" },
			]),
		).toEqual([{ brand: { name: "asc" } }, { year: "desc" }]);
	});

	test("emits an empty list when nothing is sorted", () => {
		expect(toPrismaOrderBy([])).toEqual([]);
	});
});

describe("toPrismaPage", () => {
	test("turns a page number into an offset", () => {
		expect(toPrismaPage({ page: 1, pageSize: 25 })).toEqual({
			skip: 0,
			take: 25,
		});
		expect(toPrismaPage({ page: 3, pageSize: 25 })).toEqual({
			skip: 50,
			take: 25,
		});
	});
});

describe("toPrismaArgs", () => {
	test("bundles where, orderBy and the page in one object", () => {
		expect(
			toPrismaArgs({
				filters: [leaf("$gte", [2020])],
				sort: [{ field: "year", direction: "desc", path: "year" }],
				pagination: { page: 2, pageSize: 10 },
			}),
		).toEqual({
			where: { AND: [{ year: { gte: 2020 } }] },
			orderBy: [{ year: "desc" }],
			skip: 10,
			take: 10,
		});
	});
});
