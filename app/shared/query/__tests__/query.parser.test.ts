import { describe, expect, test } from "vitest";
import { parseQuery } from "../query.parser";
import type { FilterGroup, FilterLeaf } from "../query.types";

const options = { defaults: { page: 1, pageSize: 25 } };

const parse = (search: string) =>
	parseQuery(new URLSearchParams(search), options);

const leaves = (search: string) => parse(search).filters as FilterLeaf[];

describe("parseQuery — filters", () => {
	test("reads a field, an operator and its value", () => {
		expect(leaves("filters[year][$gte]=2020")).toEqual([
			{ field: "year", operator: "$gte", values: ["2020"] },
		]);
	});

	test("joins a nested relation path with dots", () => {
		expect(leaves("filters[brand][slug][$eq]=cursos")).toEqual([
			{ field: "brand.slug", operator: "$eq", values: ["cursos"] },
		]);
	});

	// Atajo sobre la gramatica de Strapi: la allowlist de campos lo sigue
	// filtrando igual, asi que no abre superficie nueva y acorta la URL.
	test("treats a bare value as $eq", () => {
		expect(leaves("filters[year]=2021")).toEqual([
			{ field: "year", operator: "$eq", values: ["2021"] },
		]);
	});

	test("splits comma-separated values for list operators", () => {
		expect(leaves("filters[bodyType][$in]=SUV,PICKUP")).toEqual([
			{ field: "bodyType", operator: "$in", values: ["SUV", "PICKUP"] },
		]);
	});

	// En $contains la coma es texto que alguien tecleo, no un separador: partirla
	// convertiria una busqueda en dos.
	test("keeps commas intact for single-value operators", () => {
		expect(leaves("filters[q][$contains]=Ruiz, Ana")).toEqual([
			{ field: "q", operator: "$contains", values: ["Ruiz, Ana"] },
		]);
	});

	test("reads indexed values without splitting them", () => {
		expect(leaves("filters[b][$in][0]=a,b&filters[b][$in][1]=c")).toEqual([
			{ field: "b", operator: "$in", values: ["a,b", "c"] },
		]);
	});

	test("trims and drops empty items in a comma list", () => {
		expect(leaves("filters[b][$in]=a, ,b,")).toEqual([
			{ field: "b", operator: "$in", values: ["a", "b"] },
		]);
	});

	test("drops a list operator whose value is empty", () => {
		expect(leaves("filters[b][$in]=")).toEqual([]);
	});

	test("builds an $or group from indexed children", () => {
		const [group] = parse(
			"filters[$or][0][fuel][$eq]=HYBRID&filters[$or][1][fuel][$eq]=ELECTRIC",
		).filters as FilterGroup[];

		expect(group).toEqual({
			operator: "$or",
			children: [
				{ field: "fuel", operator: "$eq", values: ["HYBRID"] },
				{ field: "fuel", operator: "$eq", values: ["ELECTRIC"] },
			],
		});
	});

	test("keeps the surrounding path inside a group", () => {
		const [group] = parse("filters[brand][$or][0][slug][$eq]=cursos")
			.filters as FilterGroup[];

		expect(group.children).toEqual([
			{ field: "brand.slug", operator: "$eq", values: ["cursos"] },
		]);
	});

	test("drops a group that has no usable children", () => {
		expect(parse("filters[$or][0]=nonsense").filters).toEqual([]);
		expect(parse("filters[$or]=nonsense").filters).toEqual([]);
	});

	// Un operador suelto no dice sobre QUE campo compara, asi que no significa nada.
	test("drops an operator with no field in front of it", () => {
		expect(parse("filters[$eq]=1").filters).toEqual([]);
	});

	test("returns no filters when the key is absent or scalar", () => {
		expect(parse("").filters).toEqual([]);
		expect(parse("filters=broken").filters).toEqual([]);
	});

	test("caps the number of leaves per query", () => {
		const many = Array.from(
			{ length: 80 },
			(_, i) => `filters[f${i}][$eq]=1`,
		).join("&");

		expect(parse(many).filters).toHaveLength(60);
	});

	test("caps the number of values per leaf", () => {
		const values = Array.from({ length: 80 }, (_, i) => `v${i}`).join(",");
		const [leaf] = leaves(`filters[b][$in]=${values}`);

		expect(leaf.values).toHaveLength(50);
	});
});

describe("parseQuery — pagination", () => {
	test("falls back to the supplied defaults", () => {
		expect(parse("").pagination).toEqual({ page: 1, pageSize: 25 });
	});

	test("reads page and pageSize", () => {
		expect(
			parse("pagination[page]=3&pagination[pageSize]=10").pagination,
		).toEqual({ page: 3, pageSize: 10 });
	});

	test.each(["0", "-2", "abc", "1.5", ""])(
		"ignores an invalid page (%s)",
		(raw) => {
			expect(parse(`pagination[page]=${raw}`).pagination.page).toBe(1);
		},
	);

	// Sin techo, ?pagination[pageSize]=100000 se trae la tabla entera.
	test("clamps pageSize to the shared cap of 100", () => {
		expect(parse("pagination[pageSize]=100000").pagination.pageSize).toBe(100);
	});

	test("honours a stricter cap from the caller", () => {
		const parsed = parseQuery(new URLSearchParams("pagination[pageSize]=90"), {
			...options,
			maxPageSize: 50,
		});

		expect(parsed.pagination.pageSize).toBe(50);
	});

	test("ignores a scalar pagination key", () => {
		expect(parse("pagination=7").pagination).toEqual({ page: 1, pageSize: 25 });
	});
});

describe("parseQuery — sort", () => {
	test("reads a single field:direction pair", () => {
		expect(parse("sort=year:desc").sort).toEqual([
			{ field: "year", direction: "desc" },
		]);
	});

	test("reads an indexed list in order", () => {
		expect(parse("sort[0]=brand:asc&sort[1]=year:desc").sort).toEqual([
			{ field: "brand", direction: "asc" },
			{ field: "year", direction: "desc" },
		]);
	});

	test("defaults to ascending when no direction is given", () => {
		expect(parse("sort=year").sort).toEqual([
			{ field: "year", direction: "asc" },
		]);
	});

	test.each(["year:sideways", ":desc", ""])(
		"drops an invalid spec (%s)",
		(raw) => {
			expect(parse(`sort=${raw}`).sort).toEqual([]);
		},
	);
});

describe("parseQuery — resilience", () => {
	// Un enlace que alguien corto al pegarlo tiene que devolver la vista sin
	// filtros, no un 500: esto parsea URLs publicas.
	test("never throws on hostile or truncated input", () => {
		const hostile = [
			"filters[",
			"filters[a][$eq",
			"filters[__proto__][$eq]=1",
			"filters[a][$eq]=%E0%A4%A",
			"pagination[page][deep]=1",
			`filters${"[a]".repeat(30)}[$eq]=1`,
		];

		for (const search of hostile) {
			expect(() => parse(search)).not.toThrow();
		}
	});

	// Un `filters[__proto__]` no puede terminar contaminando Object.prototype.
	test("does not pollute the prototype chain", () => {
		parse("filters[__proto__][polluted][$eq]=yes");

		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});
