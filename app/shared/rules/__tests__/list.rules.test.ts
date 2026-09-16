import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	basePaginationSchema,
	createListRule,
	SORT_DIRECTIONS,
} from "../list.rules";

const baseRule = v.object(basePaginationSchema);

describe("basePaginationSchema", () => {
	test("accepts an empty filter — every field is optional", () => {
		expect(v.safeParse(baseRule, {}).success).toBe(true);
	});

	test("accepts a well-formed page, pageSize and search", () => {
		const result = v.safeParse(baseRule, {
			page: 2,
			pageSize: 25,
			search: "ana",
		});

		expect(result.success).toBe(true);
	});

	// page 0 romperia el skip del repositorio (skip negativo), asi que se corta en
	// la frontera y no en la consulta.
	test("rejects a page below 1", () => {
		expect(v.safeParse(baseRule, { page: 0 }).success).toBe(false);
	});

	// El tope es la defensa contra un ?pageSize=100000 que traeria la tabla entera.
	test("rejects a pageSize above the shared cap of 100", () => {
		expect(v.safeParse(baseRule, { pageSize: 101 }).success).toBe(false);
		expect(v.safeParse(baseRule, { pageSize: 100 }).success).toBe(true);
	});
});

describe("SORT_DIRECTIONS", () => {
	test("is exactly asc and desc", () => {
		expect(SORT_DIRECTIONS).toEqual(["asc", "desc"]);
	});
});

describe("createListRule", () => {
	const rule = createListRule({
		status: v.optional(v.picklist(["active", "archived"])),
	});

	// Lo que aporta el helper: cada listado declara SOLO sus filtros de dominio y
	// hereda la paginacion, en vez de repetir page/pageSize/search en cada modulo.
	test("merges the domain filters with the base pagination", () => {
		const result = v.safeParse(rule, {
			page: 1,
			pageSize: 10,
			search: "ana",
			status: "active",
		});

		expect(result.success).toBe(true);
	});

	test("still enforces the base pagination constraints", () => {
		expect(v.safeParse(rule, { pageSize: 500 }).success).toBe(false);
	});

	test("still enforces the domain filter allowlist", () => {
		expect(v.safeParse(rule, { status: "borrado" }).success).toBe(false);
	});

	test("accepts a listing with no filters at all", () => {
		expect(v.safeParse(rule, {}).success).toBe(true);
	});
});
