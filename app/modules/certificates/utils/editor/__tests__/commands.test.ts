import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { PRESETS } from "../../../domain/design/design.presets";
import {
	type DesignElement,
	designV2Schema,
} from "../../../domain/design/design-v2.schema";
import {
	addElements,
	DUPLICATE_OFFSET_PT,
	duplicateElements,
	hasDecoration,
	moveElements,
	moveLayer,
	removeElements,
	reorderElements,
	replaceElements,
	updateElement,
	withoutDecoration,
} from "../commands";
import {
	createFieldElement,
	createImageElement,
	createShapeElement,
	createTextElement,
	isMandatory,
	keepsAspect,
} from "../elements";

const design = PRESETS.institucional;
const page = { w: design.page.widthPt, h: design.page.heightPt };
const ids = (d: typeof design) => d.elements.map((e) => e.id);
const counter = () => {
	let next = 0;
	return () => `nuevo-${++next}`;
};

describe("elementos nuevos", () => {
	test("todo lo que se inserta deja un diseño válido", () => {
		const added = addElements(design, [
			createTextElement("t", page),
			createFieldElement("p", page, "participante"),
			createFieldElement("f", page, "fecha"),
			createShapeElement("r", page, "rect"),
			createShapeElement("e", page, "ellipse"),
			createShapeElement("l", page, "line"),
			createImageElement(
				"i",
				page,
				{ kind: "logo", logoId: "ayto-blanco" },
				{ widthPx: 490, heightPx: 160 },
				"Logo",
			),
		]);
		expect(v.safeParse(designV2Schema, added).success).toBe(true);
	});

	test("se insertan centrados", () => {
		const text = createTextElement("t", page);
		expect(text.x + text.w / 2).toBeCloseTo(page.w / 2, 1);
	});

	test("una imagen grande se reduce conservando su proporción", () => {
		const image = createImageElement(
			"i",
			page,
			{ kind: "logo", logoId: "ayto-blanco" },
			{ widthPx: 1000, heightPx: 500 },
			"Logo",
		);
		expect(image.w).toBe(220);
		expect(image.h).toBe(110);
	});

	test("QR y folio son obligatorios; QR e imágenes guardan su proporción", () => {
		const qr = design.elements.find((e) => e.type === "qr") as DesignElement;
		const text = design.elements.find(
			(e) => e.type === "text",
		) as DesignElement;
		const logo = design.elements.find(
			(e) => e.type === "image",
		) as DesignElement;
		expect(isMandatory(qr)).toBe(true);
		expect(isMandatory(text)).toBe(false);
		expect(keepsAspect(qr) && keepsAspect(logo)).toBe(true);
		expect(keepsAspect(text)).toBe(false);
	});
});

describe("comandos", () => {
	test("añadir nada devuelve el mismo diseño", () => {
		expect(addElements(design, [])).toBe(design);
	});

	test("actualiza un elemento sin tocar los demás", () => {
		const next = updateElement(design, "franja", { opacity: 0.5 });
		expect(next.elements.find((e) => e.id === "franja")?.opacity).toBe(0.5);
		expect(next.elements[1]).toBe(design.elements[1]);
	});

	test("reemplaza varios por id", () => {
		const moved = { ...design.elements[0], x: 99 };
		expect(replaceElements(design, [moved]).elements[0].x).toBe(99);
		expect(replaceElements(design, [])).toBe(design);
	});

	test("borrar nunca quita QR ni folio", () => {
		const next = removeElements(design, ["franja", "qr", "folio"]);
		expect(ids(next)).not.toContain("franja");
		expect(ids(next)).toEqual(expect.arrayContaining(["qr", "folio"]));
		expect(removeElements(design, ["qr"])).toBe(design);
	});

	test("duplica encima, corrido y desbloqueado; QR y folio no", () => {
		const locked = updateElement(design, "franja", { locked: true });
		const { design: next, ids: copies } = duplicateElements(
			locked,
			["franja", "qr"],
			counter(),
		);
		expect(copies).toEqual(["nuevo-1"]);
		const copy = next.elements.at(-1) as DesignElement;
		expect(copy).toMatchObject({
			id: "nuevo-1",
			locked: false,
			name: "Franja (copia)",
		});
		expect(copy.x).toBe(design.elements[0].x + DUPLICATE_OFFSET_PT);
	});

	test("mover respeta los bloqueados", () => {
		const locked = updateElement(design, "franja", { locked: true });
		const next = moveElements(locked, ["franja", "logo"], 5, -5);
		expect(next.elements.find((e) => e.id === "franja")?.x).toBe(0);
		const logo = design.elements.find((e) => e.id === "logo") as DesignElement;
		expect(next.elements.find((e) => e.id === "logo")?.x).toBe(logo.x + 5);
		expect(moveElements(design, ["logo"], 0, 0)).toBe(design);
	});
});

describe("orden de apilado", () => {
	const order = (d: typeof design) => ids(d).slice(0, 4);

	test("al frente y al fondo", () => {
		expect(ids(reorderElements(design, ["franja"], "front")).at(-1)).toBe(
			"franja",
		);
		expect(ids(reorderElements(design, ["logo"], "back"))[0]).toBe("logo");
	});

	test("un paso adelante y atrás", () => {
		const [a, b, c] = ids(design);
		expect(order(reorderElements(design, [a], "forward")).slice(0, 2)).toEqual([
			b,
			a,
		]);
		expect(order(reorderElements(design, [b], "backward")).slice(0, 2)).toEqual(
			[b, a],
		);
		expect(
			order(reorderElements(design, [a, b], "forward")).slice(0, 3),
		).toEqual([c, a, b]);
	});

	test("en los extremos o sin selección no cambia", () => {
		const [first] = ids(design);
		expect(ids(reorderElements(design, [first], "backward"))).toEqual(
			ids(design),
		);
		expect(reorderElements(design, ["nadie"], "front")).toBe(design);
	});

	test("mover una capa a una posición", () => {
		const [first] = ids(design);
		expect(ids(moveLayer(design, first, 2))[2]).toBe(first);
		expect(moveLayer(design, first, 0)).toBe(design);
		expect(moveLayer(design, "nadie", 1)).toBe(design);
		expect(ids(moveLayer(design, first, 999)).at(-1)).toBe(first);
	});
});

describe("quitar la decoración", () => {
	test("deja textos, firmas, QR y folio; quita formas y logos", () => {
		const signature = createImageElement(
			"firma",
			page,
			{ kind: "asset", ref: "/api/storage?key=f", role: "signature" },
			{ widthPx: 100, heightPx: 40 },
			"Firma",
		);
		const withSignature = addElements(design, [signature]);

		expect(hasDecoration(withSignature)).toBe(true);
		const clean = withoutDecoration(withSignature);
		const types = new Set(clean.elements.map((e) => e.type));
		expect(types.has("shape")).toBe(false);
		expect(clean.elements.some((e) => e.id === "logo")).toBe(false);
		expect(clean.elements.some((e) => e.id === "firma")).toBe(true);
		expect(types).toEqual(new Set(["text", "folio", "qr", "image"]));
		expect(withoutDecoration(clean)).toBe(clean);
		expect(v.safeParse(designV2Schema, clean).success).toBe(true);
	});
});
