import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { emptySessionValues } from "../build-course-form-defaults";
import {
	matchPendingMaterials,
	pendingSessionMaterialsOf,
} from "../pending-session-materials";

const EXISTING = "11111111-1111-4111-8111-111111111111";
const NEW_A = "22222222-2222-4222-8222-222222222222";
const NEW_B = "33333333-3333-4333-8333-333333333333";

const linkOf = (title: string) => ({
	draftId: `draft-${title}`,
	type: "LINK" as const,
	title,
	availableFromSession: false,
	externalUrl: "https://forms.example/x",
});

const rowOf = (
	date: string,
	materials: ReturnType<typeof linkOf>[] = [],
	documentId = "",
) => ({
	...emptySessionValues(),
	documentId,
	date,
	startTime: "09:00",
	endTime: "11:00",
	materials,
});

describe("pendingSessionMaterialsOf", () => {
	test("solo toma el material de filas nuevas, y recuerda las que ya existían", () => {
		const snapshot = pendingSessionMaterialsOf([
			rowOf("2026-10-05", [], EXISTING),
			rowOf("2026-10-06", [linkOf("Formulario")]),
			rowOf("2026-10-07"),
		]);

		expect(snapshot.known).toEqual([EXISTING]);
		expect(snapshot.entries).toEqual([
			{
				date: "2026-10-06",
				startTime: "09:00",
				materials: [linkOf("Formulario")],
			},
		]);
	});
});

describe("matchPendingMaterials", () => {
	const at = (date: string) => zonedInputToUtc(date, "09:00");

	// El servidor ordena las sesiones por fecha: la posición no sirve.
	test("cuelga cada grupo de la sesión que empieza a esa hora", () => {
		const snapshot = pendingSessionMaterialsOf([
			rowOf("2026-10-08", [linkOf("Tarde")]),
			rowOf("2026-10-06", [linkOf("Temprano")]),
		]);

		const { groups, orphaned } = matchPendingMaterials(snapshot, [
			{ documentId: NEW_B, startsAt: at("2026-10-06") },
			{ documentId: NEW_A, startsAt: at("2026-10-08") },
		]);

		expect(orphaned).toEqual([]);
		expect(groups).toEqual([
			{
				sessionDocumentId: NEW_A,
				materials: [
					{
						type: "LINK",
						title: "Tarde",
						availableFromSession: false,
						externalUrl: "https://forms.example/x",
					},
				],
			},
			{
				sessionDocumentId: NEW_B,
				materials: [expect.objectContaining({ title: "Temprano" })],
			},
		]);
	});

	test("una sesión que ya existía a la misma hora no se lleva lo pendiente", () => {
		const snapshot = pendingSessionMaterialsOf([
			rowOf("2026-10-06", [], EXISTING),
			rowOf("2026-10-06", [linkOf("Formulario")]),
		]);

		const { groups } = matchPendingMaterials(snapshot, [
			{ documentId: EXISTING, startsAt: at("2026-10-06") },
			{ documentId: NEW_A, startsAt: at("2026-10-06") },
		]);

		expect(groups.map((group) => group.sessionDocumentId)).toEqual([NEW_A]);
	});

	test("lo que no encuentra sesión se nombra para avisar", () => {
		const snapshot = pendingSessionMaterialsOf([
			rowOf("2026-10-06", [linkOf("Formulario")]),
		]);

		expect(matchPendingMaterials(snapshot, [])).toEqual({
			groups: [],
			orphaned: ["Formulario"],
		});
	});
});
