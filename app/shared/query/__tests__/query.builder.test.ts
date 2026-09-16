import { describe, expect, test } from "vitest";
import type { QueryPatch } from "../query.builder";
import { applyQueryPatch, toCanonicalParams } from "../query.builder";
import { parseQuery } from "../query.parser";

const defaults = { page: 1, pageSize: 25 };

const patch = (search: string, changes: QueryPatch) =>
	applyQueryPatch(new URLSearchParams(search), changes);

const readable = (params: URLSearchParams) =>
	Object.fromEntries([...params.entries()]);

describe("applyQueryPatch — filters", () => {
	test("adds a filter to an empty query string", () => {
		const params = patch("", { filters: { year: { $gte: 2020 } } });

		expect(readable(params)).toEqual({ "filters[year][$gte]": "2020" });
	});

	test("keeps unrelated filters untouched", () => {
		const params = patch("filters[brand][$eq]=cursos", {
			filters: { year: { $gte: 2020 } },
		});

		expect(readable(params)).toEqual({
			"filters[brand][$eq]": "cursos",
			"filters[year][$gte]": "2020",
		});
	});

	test("overwrites the same operator on the same field", () => {
		const params = patch("filters[year][$gte]=2020", {
			filters: { year: { $gte: 2022 } },
		});

		expect(readable(params)).toEqual({ "filters[year][$gte]": "2022" });
	});

	// Los operadores de lista van en CSV y no indexados: la URL de un catalogo
	// publico se comparte, y `[$in]=a,b` se lee.
	test("serialises list operators as a comma-separated value", () => {
		const params = patch("", { filters: { body: { $in: ["SUV", "PICKUP"] } } });

		expect(readable(params)).toEqual({ "filters[body][$in]": "SUV,PICKUP" });
	});

	test("removes a single operator with null", () => {
		const params = patch("filters[year][$gte]=2020&filters[year][$lte]=2024", {
			filters: { year: { $gte: null } },
		});

		expect(readable(params)).toEqual({ "filters[year][$lte]": "2024" });
	});

	test("removes the whole field with null", () => {
		const params = patch("filters[year][$gte]=2020&filters[brand][$eq]=t", {
			filters: { year: null },
		});

		expect(readable(params)).toEqual({ "filters[brand][$eq]": "t" });
	});

	test("drops the field once its last operator is gone", () => {
		const params = patch("filters[year][$gte]=2020", {
			filters: { year: { $gte: null } },
		});

		expect(readable(params)).toEqual({});
	});

	test("treats an empty list as a removal", () => {
		const params = patch("filters[body][$in]=SUV", {
			filters: { body: { $in: [] } },
		});

		expect(readable(params)).toEqual({});
	});

	test("refuses to serialise a list on a scalar operator", () => {
		const params = patch("", { filters: { year: { $eq: [2020, 2021] } } });

		expect(readable(params)).toEqual({});
	});
});

describe("applyQueryPatch — pagination", () => {
	// Cambiar un filtro y quedarse en la pagina 7 es la forma mas rapida de
	// enseñar un listado vacio sobre un resultado que si tiene elementos.
	test("resets the page whenever a filter changes", () => {
		const params = patch("pagination[page]=7", {
			filters: { year: { $gte: 2020 } },
		});

		expect(params.get("pagination[page]")).toBeNull();
	});

	test("respects an explicit page even alongside a filter change", () => {
		const params = patch("pagination[page]=7", {
			filters: { year: { $gte: 2020 } },
			page: 3,
		});

		expect(params.get("pagination[page]")).toBe("3");
	});

	test("sets and clears page and pageSize", () => {
		expect(patch("", { page: 2, pageSize: 50 }).get("pagination[page]")).toBe(
			"2",
		);
		expect(
			patch("pagination[pageSize]=50", { pageSize: null }).get(
				"pagination[pageSize]",
			),
		).toBeNull();
		expect(
			patch("pagination[page]=2", { page: null }).get("pagination[page]"),
		).toBeNull();
	});

	test("leaves pagination alone when the patch says nothing about it", () => {
		const params = patch("pagination[page]=4", { sort: null });

		expect(params.get("pagination[page]")).toBe("4");
	});
});

describe("applyQueryPatch — sort", () => {
	test("writes an indexed list", () => {
		const params = patch("", {
			sort: [
				{ field: "brand", direction: "asc" },
				{ field: "year", direction: "desc" },
			],
		});

		expect(readable(params)).toEqual({
			"sort[0]": "brand:asc",
			"sort[1]": "year:desc",
		});
	});

	test("clears the sort with null or an empty list", () => {
		expect(readable(patch("sort=year:desc", { sort: null }))).toEqual({});
		expect(readable(patch("sort=year:desc", { sort: [] }))).toEqual({});
	});

	test("replaces a previous sort instead of merging with it", () => {
		const params = patch("sort[0]=a:asc&sort[1]=b:asc", {
			sort: [{ field: "year", direction: "desc" }],
		});

		expect(readable(params)).toEqual({ "sort[0]": "year:desc" });
	});
});

describe("applyQueryPatch — round trip", () => {
	// La garantia que justifica que builder y parser vivan juntos: lo que el
	// cliente escribe es exactamente lo que el servidor entiende.
	test("produces a query string the parser reads back identically", () => {
		const params = patch("", {
			filters: { year: { $gte: 2020, $lte: 2024 }, body: { $in: ["SUV"] } },
			sort: [{ field: "year", direction: "desc" }],
			page: 2,
		});

		expect(parseQuery(params, { defaults })).toEqual({
			filters: [
				{ field: "body", operator: "$in", values: ["SUV"] },
				{ field: "year", operator: "$gte", values: ["2020"] },
				{ field: "year", operator: "$lte", values: ["2024"] },
			],
			pagination: { page: 2, pageSize: 25 },
			sort: [{ field: "year", direction: "desc" }],
		});
	});

	test("does not mutate the params it was given", () => {
		const original = new URLSearchParams("filters[year][$gte]=2020");

		applyQueryPatch(original, { filters: { year: null } });

		expect(original.get("filters[year][$gte]")).toBe("2020");
	});
});

describe("toCanonicalParams", () => {
	// Sin esto, `?pagination[page]=1` y la URL limpia serian dos direcciones
	// distintas con el mismo contenido: contenido duplicado de manual.
	test("drops values that already are the default", () => {
		const params = toCanonicalParams(
			new URLSearchParams("pagination[page]=1&pagination[pageSize]=25"),
			{ defaults },
		);

		expect(readable(params)).toEqual({});
	});

	test("keeps values that differ from the default", () => {
		const params = toCanonicalParams(
			new URLSearchParams("pagination[page]=2&pagination[pageSize]=50"),
			{ defaults },
		);

		expect(readable(params)).toEqual({
			"pagination[page]": "2",
			"pagination[pageSize]": "50",
		});
	});

	test("drops the sort when it matches the house default", () => {
		const options = { defaults, defaultSort: "relevance:desc" };

		expect(
			readable(
				toCanonicalParams(new URLSearchParams("sort=relevance:desc"), options),
			),
		).toEqual({});
		expect(
			readable(
				toCanonicalParams(new URLSearchParams("sort=year:desc"), options),
			),
		).toEqual({ sort: "year:desc" });
	});

	test("normalises key order so the same filters give the same URL", () => {
		const first = toCanonicalParams(
			new URLSearchParams("filters[year][$gte]=2020&filters[brand][$eq]=t"),
			{ defaults },
		);
		const second = toCanonicalParams(
			new URLSearchParams("filters[brand][$eq]=t&filters[year][$gte]=2020"),
			{ defaults },
		);

		expect(first.toString()).toBe(second.toString());
	});

	test("survives a query string with no pagination at all", () => {
		const params = toCanonicalParams(new URLSearchParams("sort=year:desc"), {
			defaults,
		});

		expect(readable(params)).toEqual({ sort: "year:desc" });
	});
});
