import { describe, expect, test } from "vitest";
import { allInOrder } from "../all-in-order";

const later = <T>(value: T, ms: number) =>
	new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const failLater = (error: Error, ms: number) =>
	new Promise<never>((_, reject) => setTimeout(() => reject(error), ms));

describe("allInOrder", () => {
	test("devuelve los valores en el orden de entrada", async () => {
		expect(await allInOrder([later("a", 10), "b", later(3, 1)])).toEqual([
			"a",
			"b",
			3,
		]);
	});

	test("gana el error de la primera posición aunque falle después", async () => {
		const first = new Error("primero");
		const second = new Error("segundo");

		await expect(
			allInOrder([failLater(first, 20), failLater(second, 1)]),
		).rejects.toBe(first);
	});

	test("espera a todas antes de decidir: un éxito previo no oculta un fallo", async () => {
		const failure = new Error("falla");

		await expect(
			allInOrder([later("ok", 1), failLater(failure, 10)]),
		).rejects.toBe(failure);
	});
});
