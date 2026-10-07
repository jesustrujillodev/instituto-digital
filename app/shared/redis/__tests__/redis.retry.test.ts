import { describe, expect, test } from "vitest";
import {
	REDIS_RECONNECT_BASE_MS,
	REDIS_RECONNECT_CAP_MS,
} from "../redis.config";
import { reconnectDelayMs } from "../redis.retry";

describe("reconnectDelayMs", () => {
	test("crece al doble en cada intento", () => {
		const atMax = (attempt: number) => reconnectDelayMs(attempt, () => 1);

		expect(atMax(1)).toBe(REDIS_RECONNECT_BASE_MS * 2);
		expect(atMax(2)).toBe(REDIS_RECONNECT_BASE_MS * 4);
		expect(atMax(3)).toBe(REDIS_RECONNECT_BASE_MS * 8);
	});

	test("nunca pasa del tope, ni con intentos enormes", () => {
		expect(reconnectDelayMs(10, () => 1)).toBe(REDIS_RECONNECT_CAP_MS);
		expect(reconnectDelayMs(5_000, () => 1)).toBe(REDIS_RECONNECT_CAP_MS);
	});

	// La mitad fija evita un bucle de reconexión inmediata; la aleatoria, que
	// todos los nodos reconecten en el mismo instante.
	test("la parte aleatoria cubre solo la mitad superior", () => {
		expect(reconnectDelayMs(10, () => 0)).toBe(REDIS_RECONNECT_CAP_MS / 2);
		expect(reconnectDelayMs(10, () => 0.5)).toBe(
			(REDIS_RECONNECT_CAP_MS * 3) / 4,
		);
	});

	test("siempre devuelve un número: ioredis nunca deja de reintentar", () => {
		for (const attempt of [1, 50, 1_000, Number.MAX_SAFE_INTEGER]) {
			expect(Number.isFinite(reconnectDelayMs(attempt))).toBe(true);
		}
	});
});
