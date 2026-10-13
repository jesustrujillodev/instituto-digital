import { describe, expect, test } from "vitest";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import { createExportGate } from "../chromium-exporter.server";

const deferred = () => {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

// Remediación (Fase C): la fila de espera de Chromium no tenía tope.
describe("createExportGate", () => {
	test("deja pasar hasta el límite y encola hasta el tope", async () => {
		const gate = createExportGate(1, 1);
		const first = deferred();
		const order: string[] = [];

		const running = gate(async () => {
			await first.promise;
			order.push("primera");
		});
		const queued = gate(async () => {
			order.push("encolada");
		});
		const rejected = gate(async () => {
			order.push("sobrante");
		}).catch((error: { code: string }) => error.code);

		expect(await rejected).toBe(CERTIFICATE_ERROR_CODES.EXPORT_BUSY);

		first.resolve();
		await Promise.all([running, queued]);
		expect(order).toEqual(["primera", "encolada"]);
	});

	test("al liberarse la fila vuelve a aceptar", async () => {
		const gate = createExportGate(1, 0);

		await gate(async () => {});

		expect(await gate(async () => "otra")).toBe("otra");
	});
});
