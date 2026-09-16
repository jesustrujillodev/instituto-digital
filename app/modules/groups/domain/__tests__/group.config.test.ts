import { describe, expect, test } from "vitest";
import { GROUP_LIST_DEFAULTS, MEMBER_CANDIDATES_LIMIT } from "../group.config";

describe("defaults del módulo", () => {
	test("la paginación tiene una fuente única", () => {
		expect(GROUP_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 10 });
	});

	// Es una lista para elegir a mano, no un listado paginado: por encima del
	// tope la vía es acotar con el buscador.
	test("el selector de miembros tiene tope", () => {
		expect(MEMBER_CANDIDATES_LIMIT).toBeGreaterThan(0);
	});
});
