import type { UIMatch } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { resolveBreadcrumb } from "../breadcrumb.utils";

function match(handle: unknown, loaderData?: unknown): UIMatch {
	return {
		id: "route",
		pathname: "/dashboard",
		params: {},
		data: loaderData,
		loaderData,
		handle,
	};
}

describe("resolveBreadcrumb", () => {
	// Es el caso de /dashboard: ninguna ruta declara rastro y el header queda
	// solo con el trigger.
	test("returns an empty trail when no match declares a breadcrumb", () => {
		expect(resolveBreadcrumb([match(undefined), match(undefined)])).toEqual([]);
	});

	test("uses the deepest match that declares a breadcrumb", () => {
		const matches = [
			match({ breadcrumb: () => [{ label: "Layout" }] }),
			match(undefined),
			match({ breadcrumb: () => [{ label: "Hoja" }] }),
		];

		expect(resolveBreadcrumb(matches)).toEqual([{ label: "Hoja" }]);
	});

	test("passes the match loader data to the breadcrumb function", () => {
		const breadcrumb = vi.fn(() => [{ label: "Ana" }]);
		const loaderData = { data: { name: "Ana" } };

		resolveBreadcrumb([match({ breadcrumb }, loaderData)]);

		expect(breadcrumb).toHaveBeenCalledWith(loaderData);
	});

	// El loader lanzó y se ve el ErrorBoundary: el header sigue montado.
	test("passes undefined when the route has no loader data", () => {
		const breadcrumb = vi.fn(() => [{ label: "Editar" }]);

		expect(resolveBreadcrumb([match({ breadcrumb })])).toEqual([
			{ label: "Editar" },
		]);
		expect(breadcrumb).toHaveBeenCalledWith(undefined);
	});

	test("ignores handles without a breadcrumb function", () => {
		const matches = [
			match({ breadcrumb: () => [{ label: "Válido" }] }),
			match({ breadcrumb: [{ label: "No es función" }] }),
			match({ other: true }),
			match(null),
			match("string"),
		];

		expect(resolveBreadcrumb(matches)).toEqual([{ label: "Válido" }]);
	});
});
