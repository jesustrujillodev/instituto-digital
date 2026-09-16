import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { defineFields, validateQuery } from "../query.rules";
import type {
	FilterLeaf,
	FilterNode,
	FilterOperator,
	ParsedQuery,
	SortSpec,
	ValidatedGroup,
	ValidatedLeaf,
} from "../query.types";

const intFromString = v.pipe(
	v.string(),
	v.regex(/^-?\d+$/),
	v.transform(Number),
);

const fields = defineFields({
	year: {
		path: "year",
		operators: ["$eq", "$gte", "$lte", "$between", "$in"],
		schema: intFromString,
		sortable: true,
	},
	brand: {
		path: "brand.slug",
		operators: ["$eq", "$in"],
		schema: v.pipe(v.string(), v.minLength(1)),
		sortable: true,
	},
	q: {
		path: "title",
		operators: ["$contains"],
		schema: v.string(),
	},
	soldAt: {
		path: "soldAt",
		operators: ["$null", "$notNull"],
		schema: intFromString,
	},
	// Se filtra por el slug —estable e indexado— y se ordena por el nombre, que
	// es lo que la persona ve en el desplegable.
	label: {
		path: "brand.slug",
		sortPath: "brand.name",
		operators: ["$eq"],
		schema: v.string(),
		sortable: true,
	},
	// Cruza varias relaciones, así que no hay una `path` que lo exprese.
	search: {
		path: "",
		operators: ["$contains"],
		schema: v.string(),
		buildCondition: (_operator, values) => ({
			OR: [{ brand: { name: { contains: values[0] } } }],
		}),
	},
});

const pagination = { page: 1, pageSize: 25 };

const validate = (filters: FilterNode[], sort: SortSpec[] = []) =>
	validateQuery({ filters, pagination, sort } satisfies ParsedQuery, {
		fields,
	});

const leaf = (
	field: string,
	operator: FilterOperator,
	values: string[],
): FilterLeaf => ({ field, operator, values });

describe("validateQuery — allowlist", () => {
	test("resolves the field to its persistence path", () => {
		const [node] = validate([leaf("brand", "$eq", ["cursos"])]).filters;

		expect(node).toEqual({
			field: "brand",
			path: "brand.slug",
			operator: "$eq",
			values: ["cursos"],
		});
	});

	test("drops a field that was never declared", () => {
		expect(validate([leaf("internalNotes", "$eq", ["x"])]).filters).toEqual([]);
	});

	// Declarar el campo no basta: cada campo dice tambien QUE se puede preguntar
	// sobre el. Un $contains sobre una columna numerica es un error de Prisma.
	test("drops an operator the field does not allow", () => {
		expect(validate([leaf("year", "$contains", ["20"])]).filters).toEqual([]);
	});

	// `fields["constructor"]` devolveria la funcion heredada de Object y el
	// `.operators` de despues reventaria.
	test("ignores inherited object keys posing as fields", () => {
		for (const field of ["constructor", "toString", "hasOwnProperty"]) {
			expect(validate([leaf(field, "$eq", ["x"])]).filters).toEqual([]);
		}
	});
});

describe("validateQuery — values", () => {
	test("coerces values with the field schema", () => {
		const [node] = validate([leaf("year", "$gte", ["2020"])])
			.filters as ValidatedLeaf[];

		expect(node.values).toEqual([2020]);
	});

	test("drops the leaf when any value fails its schema", () => {
		expect(validate([leaf("year", "$gte", ["dosmil"])]).filters).toEqual([]);
		expect(validate([leaf("year", "$in", ["2020", "x"])]).filters).toEqual([]);
	});

	test("requires exactly two values for $between", () => {
		expect(validate([leaf("year", "$between", ["2020"])]).filters).toEqual([]);
		expect(
			validate([leaf("year", "$between", ["2020", "2024", "2030"])]).filters,
		).toEqual([]);
		expect(
			validate([leaf("year", "$between", ["2020", "2024"])]).filters,
		).toHaveLength(1);
	});

	test("requires exactly one value for scalar operators", () => {
		expect(validate([leaf("year", "$eq", ["2020", "2021"])]).filters).toEqual(
			[],
		);
	});

	test("accepts one or more values for list operators", () => {
		expect(validate([leaf("year", "$in", ["2020"])]).filters).toHaveLength(1);
		expect(
			validate([leaf("year", "$in", ["2020", "2021"])]).filters,
		).toHaveLength(1);
	});
});

describe("validateQuery — custom conditions", () => {
	// La búsqueda libre cruza varias relaciones: no hay una `path` que la
	// exprese, así que el campo trae su propia condición ya resuelta.
	test("resolves buildCondition and hangs it off the leaf", () => {
		const [node] = validate([leaf("search", "$contains", ["rav"])])
			.filters as ValidatedLeaf[];

		expect(node.override).toEqual({
			OR: [{ brand: { name: { contains: "rav" } } }],
		});
	});

	test("leaves override undefined for an ordinary field", () => {
		const [node] = validate([leaf("year", "$eq", ["2020"])])
			.filters as ValidatedLeaf[];

		expect(node.override).toBeUndefined();
	});
});

describe("validateQuery — sortPath", () => {
	test("orders by sortPath while filtering by path", () => {
		const { filters, sort } = validate(
			[leaf("label", "$eq", ["cursos"])],
			[{ field: "label", direction: "asc" }],
		);

		expect((filters[0] as ValidatedLeaf).path).toBe("brand.slug");
		expect(sort[0].path).toBe("brand.name");
	});
});

describe("validateQuery — nullary operators", () => {
	// Su valor no es un dato del campo sino un booleano sobre su existencia:
	// pasarlo por el esquema de entero lo tumbaria siempre.
	test.each([
		["true", true],
		["1", true],
		["TRUE", true],
		["false", false],
		["0", false],
	])("reads %s as %s without applying the field schema", (raw, expected) => {
		const [node] = validate([leaf("soldAt", "$null", [raw])])
			.filters as ValidatedLeaf[];

		expect(node.values).toEqual([expected]);
	});

	test("drops a value that is not boolean-ish", () => {
		expect(validate([leaf("soldAt", "$null", ["maybe"])]).filters).toEqual([]);
	});
});

describe("validateQuery — groups", () => {
	test("keeps a group whose children survive", () => {
		const [group] = validate([
			{
				operator: "$or",
				children: [
					leaf("year", "$eq", ["2020"]),
					leaf("year", "$eq", ["2021"]),
				],
			},
		]).filters as ValidatedGroup[];

		expect(group.operator).toBe("$or");
		expect(group.children).toHaveLength(2);
	});

	// Un grupo sin hijos validos no es "todo" ni "nada": es una condicion que
	// nadie escribio, asi que se cae entera en vez de convertirse en un OR vacio
	// que Prisma interpretaria como "ninguna fila".
	test("drops a group once every child is discarded", () => {
		expect(
			validate([
				{ operator: "$or", children: [leaf("internalNotes", "$eq", ["x"])] },
			]).filters,
		).toEqual([]);
	});

	test("drops the outer group when the inner one collapses", () => {
		expect(
			validate([
				{
					operator: "$and",
					children: [
						{ operator: "$or", children: [leaf("nope", "$eq", ["x"])] },
					],
				},
			]).filters,
		).toEqual([]);
	});
});

describe("validateQuery — sort", () => {
	test("keeps a sortable field and resolves its path", () => {
		expect(validate([], [{ field: "brand", direction: "asc" }]).sort).toEqual([
			{ field: "brand", direction: "asc", path: "brand.slug" },
		]);
	});

	// Ordenar por una columna sin indice es justo la consulta que alguien puede
	// disparar desde la URL sin querer, por eso `sortable` es una marca aparte.
	test("drops a field that is filterable but not sortable", () => {
		expect(validate([], [{ field: "q", direction: "asc" }]).sort).toEqual([]);
	});

	test("drops an undeclared or inherited sort field", () => {
		expect(validate([], [{ field: "nope", direction: "asc" }]).sort).toEqual(
			[],
		);
		expect(
			validate([], [{ field: "constructor", direction: "asc" }]).sort,
		).toEqual([]);
	});

	test("keeps the first direction when a field repeats", () => {
		const { sort } = validate(
			[],
			[
				{ field: "year", direction: "desc" },
				{ field: "year", direction: "asc" },
			],
		);

		expect(sort).toHaveLength(1);
		expect(sort[0].direction).toBe("desc");
	});

	test("caps the number of sort fields", () => {
		const { sort } = validateQuery(
			{
				filters: [],
				pagination,
				sort: [
					{ field: "year", direction: "asc" },
					{ field: "brand", direction: "asc" },
				],
			},
			{ fields, maxSortFields: 1 },
		);

		expect(sort).toHaveLength(1);
	});

	test("falls back to the default sort when nothing valid was asked for", () => {
		const defaultSort = [
			{ field: "year", direction: "desc", path: "year" } as const,
		];

		const { sort } = validateQuery(
			{ filters: [], pagination, sort: [{ field: "nope", direction: "asc" }] },
			{ fields, defaultSort },
		);

		expect(sort).toEqual(defaultSort);
	});

	test("prefers an explicit sort over the default", () => {
		const { sort } = validateQuery(
			{ filters: [], pagination, sort: [{ field: "year", direction: "asc" }] },
			{
				fields,
				defaultSort: [{ field: "brand", direction: "desc", path: "b" }],
			},
		);

		expect(sort).toEqual([{ field: "year", direction: "asc", path: "year" }]);
	});
});

describe("validateQuery — pagination", () => {
	test("passes the pagination through untouched", () => {
		expect(validate([]).pagination).toEqual(pagination);
	});
});

describe("defineFields", () => {
	test("returns the same object so the key literals survive", () => {
		const declared = defineFields({
			a: { path: "a", operators: ["$eq"], schema: v.string() },
		});

		expect(declared.a.path).toBe("a");
	});
});
