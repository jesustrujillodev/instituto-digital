import { describe, expect, test } from "vitest";
import { catalogAccessWhere } from "../enrollment.access";
import { ACTIVE_ENROLLMENT_STATUSES } from "../enrollment.config";

describe("catalogAccessWhere", () => {
	test("deja pasar todo curso que no es por invitación", () => {
		expect(catalogAccessWhere(7).OR[0]).toEqual({
			access: { not: "INVITATION" },
		});
	});

	// Administrarlo o impartirlo no basta: la única rama que abre un curso por
	// invitación es una inscripción activa de quien mira.
	test("uno por invitación solo con invitación pendiente o aceptada de esa persona", () => {
		expect(catalogAccessWhere(7).OR[1]).toEqual({
			enrollments: {
				some: { userId: 7, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
			},
		});
		expect(ACTIVE_ENROLLMENT_STATUSES).toEqual(["INVITED", "ENROLLED"]);
	});
});
