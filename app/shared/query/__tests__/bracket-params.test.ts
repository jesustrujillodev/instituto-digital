import { describe, expect, test } from "vitest";
import {
	parseBrackets,
	sortBracketKeys,
	stringifyBrackets,
	toValueList,
} from "../bracket-params";

describe("parseBrackets", () => {
	test("reads a flat key with no brackets", () => {
		expect(parseBrackets(new URLSearchParams("sort=year:desc"))).toEqual({
			sort: "year:desc",
		});
	});

	test("nests one level per bracket", () => {
		const tree = parseBrackets(new URLSearchParams("filters[year][$gte]=2020"));

		expect(tree).toEqual({ filters: { year: { $gte: "2020" } } });
	});

	test("nests a relation path and an operator in the same key", () => {
		const tree = parseBrackets(
			new URLSearchParams("filters[brand][slug][$eq]=cursos"),
		);

		expect(tree).toEqual({ filters: { brand: { slug: { $eq: "cursos" } } } });
	});

	test("represents indexed keys as an object, not an array", () => {
		const tree = parseBrackets(
			new URLSearchParams("filters[$or][0][fuel][$eq]=HYBRID"),
		);

		expect(tree).toEqual({
			filters: { $or: { "0": { fuel: { $eq: "HYBRID" } } } },
		});
	});

	test("assigns the next free index to empty brackets", () => {
		const tree = parseBrackets(new URLSearchParams("tag[]=a&tag[]=b"));

		expect(tree).toEqual({ tag: { "0": "a", "1": "b" } });
	});

	test("assigns an index to empty brackets in the middle of a key", () => {
		const tree = parseBrackets(new URLSearchParams("g[][b]=1&g[][b]=2"));

		expect(tree).toEqual({ g: { "0": { b: "1" }, "1": { b: "2" } } });
	});

	test("merges sibling keys under the same branch", () => {
		const tree = parseBrackets(
			new URLSearchParams("f[year][$gte]=2020&f[year][$lte]=2024"),
		);

		expect(tree).toEqual({ f: { year: { $gte: "2020", $lte: "2024" } } });
	});

	// Una clave rota se descarta entera en vez de interpretarse a medias: adivinar
	// lo que alguien quiso escribir es como se cuelan filtros que nadie puso.
	test("drops malformed keys instead of guessing", () => {
		const tree = parseBrackets(
			new URLSearchParams("a[b=1&c]d=2&e[[f]]=3&ok=4"),
		);

		expect(tree).toEqual({ ok: "4" });
	});

	// El query string es entrada de terceros: sin tope, un anidamiento absurdo
	// construye un objeto igual de profundo y revienta a todo lo que lo recorra.
	test("drops keys deeper than the depth limit", () => {
		const deep = `a${"[x]".repeat(20)}=1`;

		expect(parseBrackets(new URLSearchParams(deep))).toEqual({});
	});

	test("keeps the first value when a scalar and a branch collide", () => {
		expect(parseBrackets(new URLSearchParams("a=1&a[b]=2"))).toEqual({
			a: "1",
		});
		expect(parseBrackets(new URLSearchParams("a[b]=2&a=1"))).toEqual({
			a: { b: "2" },
		});
	});

	test("keeps the first value when the same key repeats", () => {
		expect(parseBrackets(new URLSearchParams("a=1&a=2"))).toEqual({ a: "1" });
	});

	test("stops after the parameter budget is spent", () => {
		const many = Array.from({ length: 250 }, (_, i) => `k${i}=1`).join("&");
		const tree = parseBrackets(new URLSearchParams(many));

		expect(Object.keys(tree)).toHaveLength(200);
	});

	test("decodes percent-encoded values", () => {
		const tree = parseBrackets(
			new URLSearchParams("filters[q][$contains]=Rav%204"),
		);

		expect(tree).toEqual({ filters: { q: { $contains: "Rav 4" } } });
	});
});

describe("sortBracketKeys", () => {
	// Por texto, "10" iria antes que "2" y el orden de un $or dejaria de ser el
	// que se escribio en la URL.
	test("orders numeric keys by value, not lexicographically", () => {
		expect(sortBracketKeys(["10", "2", "1"])).toEqual(["1", "2", "10"]);
	});

	test("puts numeric keys before textual ones", () => {
		expect(sortBracketKeys(["zeta", "1", "alpha"])).toEqual([
			"1",
			"alpha",
			"zeta",
		]);
	});

	test("returns an empty list untouched", () => {
		expect(sortBracketKeys([])).toEqual([]);
	});
});

describe("stringifyBrackets", () => {
	test("rebuilds the bracket notation", () => {
		const params = stringifyBrackets({ filters: { year: { $gte: "2020" } } });

		expect([...params.keys()]).toEqual(["filters[year][$gte]"]);
		expect(params.get("filters[year][$gte]")).toBe("2020");
	});

	// El orden tiene que ser determinista: de esta cadena sale la URL canonica que
	// se le entrega a los buscadores, y los mismos filtros deben dar la misma URL.
	test("emits keys in a stable, canonical order", () => {
		const first = stringifyBrackets({ b: "2", a: "1", "10": "x", "2": "y" });
		const second = stringifyBrackets({ a: "1", "2": "y", "10": "x", b: "2" });

		expect(first.toString()).toBe(second.toString());
		expect([...first.keys()]).toEqual(["2", "10", "a", "b"]);
	});

	test("emits nothing for an empty tree", () => {
		expect(stringifyBrackets({}).toString()).toBe("");
		expect(stringifyBrackets({ filters: {} }).toString()).toBe("");
	});

	test("round-trips anything parseBrackets produced", () => {
		const original = new URLSearchParams(
			"filters[year][$gte]=2020&filters[$or][0][fuel][$eq]=HYBRID&pagination[page]=2&sort=year:desc",
		);

		const roundTripped = stringifyBrackets(parseBrackets(original));

		expect(parseBrackets(roundTripped)).toEqual(parseBrackets(original));
	});
});

describe("toValueList", () => {
	test("wraps a scalar in a single-item list", () => {
		expect(toValueList("a")).toEqual(["a"]);
	});

	test("returns indexed children in numeric order", () => {
		expect(toValueList({ "10": "c", "1": "a", "2": "b" })).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("skips nested branches that are not scalars", () => {
		expect(toValueList({ "0": "a", "1": { deep: "b" } })).toEqual(["a"]);
	});

	test("returns an empty list for undefined", () => {
		expect(toValueList(undefined)).toEqual([]);
	});
});
