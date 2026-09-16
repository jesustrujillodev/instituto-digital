import { describe, expect, test } from "vitest";
import {
	TRAINER_LIST_DEFAULTS,
	TRAINER_STATS_PENDING,
} from "../trainer.config";

describe("TRAINER_LIST_DEFAULTS", () => {
	test("es la fuente única de la paginación del catálogo", () => {
		expect(TRAINER_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 10 });
	});
});

describe("TRAINER_STATS_PENDING", () => {
	// Cero y null son los valores que la ficha pinta como estado vacío. PRD-03 y
	// PRD-06 sustituyen el cálculo, no la forma.
	test("los contadores nacen vacíos, no inventados", () => {
		expect(TRAINER_STATS_PENDING).toEqual({
			coursesTaught: 0,
			averageRating: null,
		});
	});
});
