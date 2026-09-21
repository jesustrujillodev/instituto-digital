import { describe, expect, test } from "vitest";
import { type BatchSelection, planBatch } from "../enrollment-batch";

const selectionOf = (
	overrides: Partial<BatchSelection> = {},
): BatchSelection => ({
	selected: 3,
	seatsNeeded: 3,
	seatsLeft: 8,
	inviteOnly: 0,
	canInvite: false,
	...overrides,
});

describe("planBatch", () => {
	test("con lugar suficiente deja inscribir y dice cuántos ocupa", () => {
		expect(planBatch(selectionOf())).toEqual({
			canAssign: true,
			blocked: false,
			message: "Inscribir ocupará 3 de 8 lugares libres.",
		});
	});

	test("avisa antes de enviar si la selección no cabe", () => {
		expect(planBatch(selectionOf({ seatsNeeded: 12 }))).toEqual({
			canAssign: false,
			blocked: true,
			message: "Inscribir ocuparía 12 lugares y solo quedan 8.",
		});
	});

	test("un curso lleno aún deja invitar si es por invitación", () => {
		expect(
			planBatch(selectionOf({ seatsLeft: 0, canInvite: true })).message,
		).toBe("El curso está lleno. Aún puedes invitar.");
	});

	test("sin cupo límite no hay tope", () => {
		expect(
			planBatch(selectionOf({ seatsNeeded: 1, seatsLeft: null })),
		).toMatchObject({ canAssign: true, message: "Inscribir ocupará 1 lugar." });
	});

	test("personal de otra dependencia solo se invita", () => {
		expect(planBatch(selectionOf({ inviteOnly: 2 }))).toMatchObject({
			canAssign: false,
			blocked: true,
		});
	});

	test("un grupo ya inscrito completo no ocupa lugares", () => {
		expect(planBatch(selectionOf({ seatsNeeded: 0 }))).toMatchObject({
			canAssign: false,
			blocked: false,
			message: "Todos ya están inscritos.",
		});
	});

	test("sin selección solo orienta", () => {
		expect(planBatch(selectionOf({ selected: 0 })).canAssign).toBe(false);
	});
});
