import { describe, expect, test } from "vitest";
import { createAfterCommitQueue } from "../after-commit.server";

describe("createAfterCommitQueue", () => {
	test("dentro de una transacción espera al commit", async () => {
		const queue = createAfterCommitQueue();
		const events: string[] = [];

		await queue.track(async () => {
			await queue.afterCommit(async () => {
				events.push("invalidar");
			});
			events.push("escribir");
		});

		expect(events).toEqual(["escribir", "invalidar"]);
	});

	test("si la transacción se revierte, lo encolado no corre", async () => {
		const queue = createAfterCommitQueue();
		const events: string[] = [];

		await expect(
			queue.track(async () => {
				await queue.afterCommit(async () => {
					events.push("invalidar");
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		expect(events).toEqual([]);
	});

	test("fuera de una transacción corre en el momento", async () => {
		const queue = createAfterCommitQueue();
		const events: string[] = [];

		await queue.afterCommit(async () => {
			events.push("invalidar");
		});

		expect(events).toEqual(["invalidar"]);
	});

	// Una transacción anidada es la misma (runInTransaction la reutiliza): lo
	// suyo corre cuando se confirma la de fuera, no antes.
	test("una transacción anidada se suma a la cola de la de fuera", async () => {
		const queue = createAfterCommitQueue();
		const events: string[] = [];

		await queue.track(async () => {
			await queue.track(async () => {
				await queue.afterCommit(async () => {
					events.push("invalidar");
				});
			});
			events.push("fin de la anidada");
		});

		expect(events).toEqual(["fin de la anidada", "invalidar"]);
	});

	test("una tarea que falla no impide las demás ni el resultado", async () => {
		const queue = createAfterCommitQueue();
		const events: string[] = [];

		const result = await queue.track(async () => {
			await queue.afterCommit(() => Promise.reject(new Error("redis down")));
			await queue.afterCommit(async () => {
				events.push("segunda");
			});
			return "ok";
		});

		expect(result).toBe("ok");
		expect(events).toEqual(["segunda"]);
	});

	test("las transacciones concurrentes no comparten cola", async () => {
		const queue = createAfterCommitQueue();
		const events: string[] = [];
		let release: () => void = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});

		const slow = queue.track(async () => {
			await queue.afterCommit(async () => {
				events.push("lenta");
			});
			await blocked;
		});
		await queue.track(async () => {
			await queue.afterCommit(async () => {
				events.push("rápida");
			});
		});
		expect(events).toEqual(["rápida"]);

		release();
		await slow;
		expect(events).toEqual(["rápida", "lenta"]);
	});
});
