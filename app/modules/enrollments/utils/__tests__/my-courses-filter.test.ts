import { describe, expect, test } from "vitest";
import type { MyCourseEntry, MyCourses } from "../../domain/enrollment.types";
import {
	activeFilterCount,
	dependencyOptionsOf,
	EMPTY_FILTER,
	matchesFilter,
	summaryOf,
	visibleSectionsOf,
} from "../my-courses-filter";

const entryOf = (course: Partial<MyCourseEntry["course"]>) =>
	({
		course: {
			title: "Atención ciudadana",
			dependencyName: "Secretaría de Obras Públicas",
			modality: "IN_PERSON",
			format: "SCHEDULED",
			...course,
		},
	}) as MyCourseEntry;

const mineOf = (counts: Partial<Record<keyof MyCourses, number>>) =>
	Object.fromEntries(
		(
			[
				"invitations",
				"inProgress",
				"upcoming",
				"finished",
				"withdrawn",
			] as const
		).map((section) => [
			section,
			Array.from({ length: counts[section] ?? 0 }, () => entryOf({})),
		]),
	) as unknown as MyCourses;

describe("matchesFilter", () => {
	test("busca en título y dependencia sin distinguir acentos", () => {
		const entry = entryOf({ title: "Ofimática básica" });

		expect(matchesFilter(entry, { ...EMPTY_FILTER, query: "ofimatica" })).toBe(
			true,
		);
		expect(matchesFilter(entry, { ...EMPTY_FILTER, query: "PÚBLICAS" })).toBe(
			true,
		);
		expect(matchesFilter(entry, { ...EMPTY_FILTER, query: "excel" })).toBe(
			false,
		);
	});

	test("cada grupo vacío deja pasar todo; con valores, solo esos", () => {
		const entry = entryOf({ modality: "ONLINE", format: "SELF_PACED" });

		expect(matchesFilter(entry, EMPTY_FILTER)).toBe(true);
		expect(
			matchesFilter(entry, {
				...EMPTY_FILTER,
				modalities: ["ONLINE", "HYBRID"],
				formats: ["SELF_PACED"],
			}),
		).toBe(true);
		expect(
			matchesFilter(entry, { ...EMPTY_FILTER, modalities: ["IN_PERSON"] }),
		).toBe(false);
		expect(
			matchesFilter(entry, {
				...EMPTY_FILTER,
				dependencies: ["Secretaría de Desarrollo Social"],
			}),
		).toBe(false);
	});
});

describe("visibleSectionsOf", () => {
	test("de entrada, todo menos las inscripciones canceladas", () => {
		expect(visibleSectionsOf(EMPTY_FILTER)).toEqual([
			"invitations",
			"inProgress",
			"upcoming",
			"finished",
		]);
	});

	test("las elegidas, en el orden de la página", () => {
		expect(
			visibleSectionsOf({
				...EMPTY_FILTER,
				sections: ["withdrawn", "inProgress"],
			}),
		).toEqual(["inProgress", "withdrawn"]);
	});
});

test("activeFilterCount no cuenta la búsqueda", () => {
	expect(
		activeFilterCount({
			...EMPTY_FILTER,
			query: "excel",
			sections: ["finished"],
			modalities: ["ONLINE", "HYBRID"],
		}),
	).toBe(3);
});

test("dependencyOptionsOf junta las dependencias sin repetir y en orden", () => {
	const mine = mineOf({});
	mine.upcoming = [
		entryOf({ dependencyName: "Tesorería" }),
		entryOf({ dependencyName: "Oficialía Mayor" }),
	];
	mine.withdrawn = [entryOf({ dependencyName: "Tesorería" })];

	expect(dependencyOptionsOf(mine)).toEqual(["Oficialía Mayor", "Tesorería"]);
});

describe("summaryOf", () => {
	test("nombra solo lo que hay, con su plural", () => {
		expect(
			summaryOf(
				mineOf({ invitations: 1, inProgress: 2, upcoming: 1, finished: 3 }),
			),
		).toBe("1 invitación · 2 en curso · 1 próxima · 3 finalizadas");
		expect(summaryOf(mineOf({ upcoming: 2, withdrawn: 4 }))).toBe("2 próximas");
	});
});
