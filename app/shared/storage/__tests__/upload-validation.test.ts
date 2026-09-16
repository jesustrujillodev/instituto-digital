import { describe, expect, test } from "vitest";
import type { UploadInput } from "../upload-validation";
import { validateUploadInput } from "../upload-validation";

const fileOf = (overrides: Partial<UploadInput> = {}): UploadInput => ({
	name: "foto.png",
	type: "image/png",
	size: 1024,
	arrayBuffer: async () => new ArrayBuffer(0),
	...overrides,
});

const IMAGES = ["image/png", "image/jpeg", "image/webp"] as const;

describe("validateUploadInput", () => {
	test("accepts a file that satisfies every option", () => {
		expect(
			validateUploadInput(fileOf(), { allowedTypes: IMAGES, maxBytes: 5000 }),
		).toBeNull();
	});

	// Un input de archivo vacío llega como un File de 0 bytes, no como ausencia.
	// Sin este corte se subiría un objeto inútil y se persistiría su URL.
	test("rejects an empty file regardless of the options", () => {
		expect(validateUploadInput(fileOf({ size: 0 }))).toBe("archivo vacío");
		expect(validateUploadInput(fileOf({ size: 0 }), {})).toBe("archivo vacío");
	});

	test("rejects a type outside the allowlist and names it", () => {
		expect(
			validateUploadInput(fileOf({ type: "application/pdf" }), {
				allowedTypes: IMAGES,
			}),
		).toBe("tipo no permitido: application/pdf");
	});

	// Un navegador puede no saber el MIME y mandar "": el mensaje no debe quedar
	// colgando en "tipo no permitido: ".
	test("names an unknown type when the browser sent none", () => {
		expect(
			validateUploadInput(fileOf({ type: "" }), { allowedTypes: IMAGES }),
		).toBe("tipo no permitido: desconocido");
	});

	test("accepts every type of the allowlist", () => {
		for (const type of IMAGES) {
			expect(
				validateUploadInput(fileOf({ type }), { allowedTypes: IMAGES }),
			).toBeNull();
		}
	});

	test("rejects a file above the size cap and states the limit", () => {
		expect(
			validateUploadInput(fileOf({ size: 5001 }), { maxBytes: 5000 }),
		).toBe("supera el máximo de 5000 bytes");
	});

	test("a file exactly at the cap is accepted", () => {
		expect(
			validateUploadInput(fileOf({ size: 5000 }), { maxBytes: 5000 }),
		).toBeNull();
	});

	// El tipo se comprueba antes que el tamaño: con las dos infracciones a la vez
	// se reporta la del tipo, que es la más informativa para corregir.
	test("reports the type before the size when both fail", () => {
		expect(
			validateUploadInput(fileOf({ type: "application/pdf", size: 9999 }), {
				allowedTypes: IMAGES,
				maxBytes: 5000,
			}),
		).toBe("tipo no permitido: application/pdf");
	});

	test("without options only the empty-file rule applies", () => {
		expect(
			validateUploadInput(
				fileOf({ type: "application/x-msdownload", size: 1e9 }),
			),
		).toBeNull();
	});

	// maxBytes 0 es un límite real (nada pasa), no un "sin límite": el `!== undefined`
	// del código es lo que lo distingue de la ausencia de la opción.
	test("a maxBytes of 0 is a real limit, not an absent one", () => {
		expect(validateUploadInput(fileOf({ size: 1 }), { maxBytes: 0 })).toBe(
			"supera el máximo de 0 bytes",
		);
	});

	// Una allowlist vacía no deja pasar nada. Es coherente con hasRole([]) y con el
	// criterio fail-closed del proyecto.
	test("an empty allowlist lets nothing through", () => {
		expect(validateUploadInput(fileOf(), { allowedTypes: [] })).toBe(
			"tipo no permitido: image/png",
		);
	});
});
