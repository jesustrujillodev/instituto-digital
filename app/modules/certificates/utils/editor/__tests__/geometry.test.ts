import { describe, expect, test } from "vitest";
import { PRESETS } from "../../../domain/design/design.presets";
import type { DesignElement } from "../../../domain/design/design-v2.schema";
import { aabbOf } from "../../../domain/design/geometry";
import {
	boundsOf,
	containsPoint,
	elementsInMarquee,
	hitTest,
	MIN_ELEMENT_PT,
	normalizeAngle,
	resizeBox,
	rotationFor,
	roundBox,
	toLocal,
} from "../geometry";

const box = { x: 100, y: 100, w: 200, h: 100, rotation: 0 };
const rotated = { ...box, rotation: 90 };
const element = (patch: Partial<DesignElement>) =>
	({ ...PRESETS.institucional.elements[0], ...patch }) as DesignElement;

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("puntos y cajas", () => {
	test("lleva un punto al marco del elemento", () => {
		const local = toLocal(rotated, { x: 200, y: 50 });
		close(local.x, -100);
		close(local.y, 0);
	});

	test("contiene puntos según su rotación", () => {
		expect(containsPoint(box, { x: 290, y: 150 })).toBe(true);
		expect(containsPoint(rotated, { x: 290, y: 150 })).toBe(false);
		expect(containsPoint(rotated, { x: 200, y: 60 })).toBe(true);
	});

	test("la caja envolvente de una caja rotada", () => {
		const aabb = aabbOf(rotated);
		close(aabb.x, 150);
		close(aabb.y, 50);
		close(aabb.w, 100);
		close(aabb.h, 200);
	});

	test("gana el elemento visible más alto", () => {
		const below = element({ id: "a", ...box });
		const above = element({ id: "b", ...box });
		const hidden = element({ id: "c", ...box, hidden: true });
		expect(hitTest([below, above, hidden], { x: 150, y: 150 })?.id).toBe("b");
		expect(hitTest([below], { x: 0, y: 0 })).toBeNull();
	});

	test("la marquesina toma lo que toca, no lo oculto", () => {
		const one = element({ id: "a", x: 0, y: 0, w: 10, h: 10, rotation: 0 });
		const two = element({ id: "b", x: 50, y: 50, w: 10, h: 10, rotation: 0 });
		const hidden = element({
			id: "c",
			x: 0,
			y: 0,
			w: 10,
			h: 10,
			rotation: 0,
			hidden: true,
		});
		const picked = elementsInMarquee([one, two, hidden], {
			x: 5,
			y: 5,
			w: 20,
			h: 20,
		});
		expect(picked.map((e) => e.id)).toEqual(["a"]);
	});

	test("la caja de varias cajas", () => {
		expect(boundsOf([])).toBeNull();
		expect(boundsOf([box, { ...box, x: 400, y: 0, h: 50 }])).toEqual({
			x: 100,
			y: 0,
			w: 500,
			h: 200,
		});
	});
});

describe("resizeBox", () => {
	test("un tirador lateral solo cambia ese lado", () => {
		expect(
			resizeBox(box, "e", { x: 50, y: 30 }, { keepAspect: false }),
		).toEqual({
			...box,
			w: 250,
		});
		expect(resizeBox(box, "w", { x: 50, y: 0 }, { keepAspect: false })).toEqual(
			{
				...box,
				x: 150,
				w: 150,
			},
		);
		expect(
			resizeBox(box, "n", { x: 0, y: -20 }, { keepAspect: false }),
		).toEqual({
			...box,
			y: 80,
			h: 120,
		});
	});

	test("una esquina con proporción escala los dos lados", () => {
		const next = resizeBox(box, "se", { x: 200, y: 0 }, { keepAspect: true });
		expect(next).toEqual({ ...box, w: 400, h: 200 });
	});

	test("un lado con proporción arrastra al otro", () => {
		expect(resizeBox(box, "e", { x: 200, y: 0 }, { keepAspect: true }).h).toBe(
			200,
		);
		expect(resizeBox(box, "s", { x: 0, y: 100 }, { keepAspect: true }).w).toBe(
			400,
		);
	});

	test("rotada, la esquina opuesta queda en su sitio", () => {
		const turned = { ...box, rotation: 30 };
		const before = aabbOf({ ...turned });
		const next = resizeBox(
			turned,
			"se",
			{ x: 40, y: 40 },
			{ keepAspect: false },
		);
		// La esquina nw rotada es la que no se mueve.
		const corner = (b: typeof turned) => {
			const cx = b.x + b.w / 2;
			const cy = b.y + b.h / 2;
			const cos = Math.cos((30 * Math.PI) / 180);
			const sin = Math.sin((30 * Math.PI) / 180);
			return {
				x: cx + (-b.w / 2) * cos - (-b.h / 2) * sin,
				y: cy + (-b.w / 2) * sin + (-b.h / 2) * cos,
			};
		};
		close(corner(next).x, corner(turned).x);
		close(corner(next).y, corner(turned).y);
		expect(before.w).toBeGreaterThan(0);
	});

	test("no baja del tamaño mínimo, tampoco con proporción", () => {
		expect(
			resizeBox(box, "e", { x: -500, y: 0 }, { keepAspect: false }).w,
		).toBe(MIN_ELEMENT_PT);
		const tiny = resizeBox(
			box,
			"se",
			{ x: -500, y: -500 },
			{ keepAspect: true },
		);
		expect(Math.min(tiny.w, tiny.h)).toBeCloseTo(MIN_ELEMENT_PT, 6);
	});
});

describe("rotación", () => {
	test("normaliza a (-180, 180]", () => {
		expect(normalizeAngle(270)).toBe(-90);
		expect(normalizeAngle(-190)).toBe(170);
		expect(normalizeAngle(180)).toBe(180);
	});

	test("gira con el puntero alrededor del centro", () => {
		const center = { x: 200, y: 150 };
		const angle = rotationFor(
			box,
			0,
			{ x: 300, y: 150 },
			{ x: center.x, y: 250 },
			{ snap: false },
		);
		expect(angle).toBe(90);
	});

	test("con Shift se ajusta de 15 en 15", () => {
		const angle = rotationFor(
			box,
			0,
			{ x: 300, y: 150 },
			{ x: 300, y: 170 },
			{ snap: true },
		);
		expect(angle % 15).toBe(0);
	});
});

test("redondea a centésimas", () => {
	expect(roundBox({ x: 1.005, y: 2.3333, w: 3, h: 4.129 })).toEqual({
		x: 1,
		y: 2.33,
		w: 3,
		h: 4.13,
	});
});
