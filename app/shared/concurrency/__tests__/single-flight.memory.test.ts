import { describe, expect, test } from "vitest";
import { createMemorySingleFlight } from "../single-flight.memory";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `fn` falso con contador de invocaciones y un fallo programable. */
const createFakeFn = (options: { fails?: boolean } = {}) => {
	const calls = { count: 0 };

	const fn = async () => {
		calls.count += 1;
		await sleep(1);
		if (options.fails) throw new Error("inner falló");
		return `resultado-${calls.count}`;
	};

	return { fn, calls };
};

describe("createMemorySingleFlight", () => {
	// Es la capa 1 de la rotación del refresh: N peticiones concurrentes con el
	// mismo token comparten UNA rotación y reciben el mismo par de tokens.
	test("collapses concurrent calls into a single invocation", async () => {
		const flight = createMemorySingleFlight();
		const { fn, calls } = createFakeFn();

		const results = await Promise.all([
			flight.run("k", 10_000, fn),
			flight.run("k", 10_000, fn),
			flight.run("k", 10_000, fn),
		]);

		expect(calls.count).toBe(1);
		expect(results).toEqual(["resultado-1", "resultado-1", "resultado-1"]);
	});

	// El resultado sigue cacheado tras resolverse: un cliente rezagado que llega
	// dentro de la ventana de gracia recibe el MISMO valor, no uno nuevo.
	test("serves the cached result to a late caller inside the TTL", async () => {
		const flight = createMemorySingleFlight();
		const { fn, calls } = createFakeFn();

		const first = await flight.run("k", 10_000, fn);
		const second = await flight.run("k", 10_000, fn);

		expect(calls.count).toBe(1);
		expect(second).toBe(first);
	});

	test("runs again once the TTL has expired", async () => {
		const flight = createMemorySingleFlight();
		const { fn, calls } = createFakeFn();

		await flight.run("k", 5, fn);
		await sleep(20);
		await flight.run("k", 5, fn);

		expect(calls.count).toBe(2);
	});

	// Los rechazos NO se cachean: si la primera rotación falló por un corte de red,
	// el siguiente intento tiene que reintentar y no heredar el fallo toda la
	// ventana.
	test("does not cache a rejection — the next call retries", async () => {
		const flight = createMemorySingleFlight();
		const failing = createFakeFn({ fails: true });

		await expect(flight.run("k", 10_000, failing.fn)).rejects.toThrow(
			"inner falló",
		);
		await expect(flight.run("k", 10_000, failing.fn)).rejects.toThrow(
			"inner falló",
		);

		expect(failing.calls.count).toBe(2);
	});

	test("concurrent callers all observe the same rejection", async () => {
		const flight = createMemorySingleFlight();
		const { fn, calls } = createFakeFn({ fails: true });

		const results = await Promise.allSettled([
			flight.run("k", 10_000, fn),
			flight.run("k", 10_000, fn),
		]);

		expect(calls.count).toBe(1);
		expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
	});

	test("keys do not collapse into each other", async () => {
		const flight = createMemorySingleFlight();
		const { fn, calls } = createFakeFn();

		await Promise.all([
			flight.run("a", 10_000, fn),
			flight.run("b", 10_000, fn),
		]);

		expect(calls.count).toBe(2);
	});

	// El barrido corre en cada run: no debe invalidar entradas vivas de otras
	// claves, o el dedup dejaría de servir para nada.
	test("the sweep leaves live entries of other keys alone", async () => {
		const flight = createMemorySingleFlight();
		const { fn, calls } = createFakeFn();

		await flight.run("larga", 10_000, fn);
		await flight.run("corta", 5, fn);
		await sleep(20);
		await flight.run("corta", 5, fn); // dispara el barrido
		await flight.run("larga", 10_000, fn);

		expect(calls.count).toBe(3);
	});
});
