import { describe, expect, test } from "vitest";
import { calendarCourseWhere } from "../calendar.access";
import type { CalendarPlan } from "../calendar.types";

const planOf = (overrides: Partial<CalendarPlan> = {}): CalendarPlan => ({
	viewerId: 50,
	participates: false,
	organizer: { kind: "none" },
	staffDependencyId: null,
	...overrides,
});

const statusesOf = (branch: Record<string, unknown>) => branch.status;

describe("calendarCourseWhere", () => {
	test("quien no cursa ni organiza solo alcanza lo que imparte", () => {
		expect(calendarCourseWhere(planOf())).toEqual({
			OR: [
				{
					status: { in: ["PUBLISHED", "FINISHED"] },
					trainers: { some: { userId: 50 } },
				},
			],
		});
	});

	test("un participante suma inscripción activa e invitación pendiente", () => {
		const { OR } = calendarCourseWhere(planOf({ participates: true }));

		expect(OR).toContainEqual({
			status: { in: ["PUBLISHED", "FINISHED"] },
			enrollments: { some: { userId: 50, status: "ENROLLED" } },
		});
		expect(OR).toContainEqual({
			status: "PUBLISHED",
			enrollments: { some: { userId: 50, status: "INVITED" } },
		});
	});

	test("solo la rama del organizador admite borradores", () => {
		const { OR } = calendarCourseWhere(
			planOf({
				participates: true,
				organizer: { kind: "dependency", dependencyId: 3 },
				staffDependencyId: 3,
			}),
		);

		const withDrafts = OR.filter((branch) =>
			JSON.stringify(statusesOf(branch)).includes("DRAFT"),
		);
		expect(withDrafts).toEqual([
			{
				dependencyId: 3,
				status: { in: ["DRAFT", "PUBLISHED", "FINISHED"] },
			},
		]);
	});

	test("ninguna rama admite un curso cancelado", () => {
		const { OR } = calendarCourseWhere(
			planOf({
				participates: true,
				organizer: { kind: "global" },
				staffDependencyId: 3,
			}),
		);

		for (const branch of OR) {
			expect(JSON.stringify(statusesOf(branch))).not.toContain("CANCELLED");
		}
	});

	test("el capacitador interno organiza por autor y dependencia", () => {
		const { OR } = calendarCourseWhere(
			planOf({ organizer: { kind: "creator", dependencyId: 3, userId: 50 } }),
		);

		expect(OR).toContainEqual({
			dependencyId: 3,
			createdById: 50,
			status: { in: ["DRAFT", "PUBLISHED", "FINISHED"] },
		});
	});

	test("el personal se busca por la dependencia ACTUAL de la persona", () => {
		const { OR } = calendarCourseWhere(planOf({ staffDependencyId: 3 }));

		expect(OR).toContainEqual({
			status: { in: ["PUBLISHED", "FINISHED"] },
			enrollments: {
				some: { status: "ENROLLED", user: { dependencyId: 3 } },
			},
		});
	});
});
