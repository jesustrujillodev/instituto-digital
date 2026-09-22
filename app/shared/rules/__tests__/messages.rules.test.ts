import * as v from "valibot";
import { describe, expect, test } from "vitest";
import "../messages.rules";

// El respaldo se registra en un store GLOBAL de valibot al importar el modulo.
// Estos esquemas se declaran a proposito sin mensaje: son el caso que el
// respaldo tiene que cubrir.
const untitled = v.pipe(v.string(), v.minLength(3), v.maxLength(10));

describe("respaldo en español", () => {
	test("una longitud minima incumplida ya no habla en ingles", () => {
		const result = v.safeParse(untitled, "ab");

		expect(result.issues?.[0].message).toBe(
			"Debe tener al menos 3 caracteres.",
		);
	});

	test("una longitud maxima incumplida ya no habla en ingles", () => {
		const result = v.safeParse(untitled, "12345678901");

		expect(result.issues?.[0].message).toBe(
			"No puede superar los 10 caracteres.",
		);
	});

	// Un dato que no llega no es un tipo equivocado: el formulario tiene que decir
	// "falta", no "debe ser un texto".
	test("un campo ausente se reporta como obligatorio", () => {
		const result = v.safeParse(v.object({ title: v.string() }), {});

		expect(result.issues?.[0].message).toBe("Este dato es obligatorio.");
	});

	// `minLength` vale igual para texto y para lista, y el mensaje no.
	test("la longitud de una lista habla de opciones, no de caracteres", () => {
		const rule = v.pipe(v.array(v.string()), v.minLength(1));

		expect(v.safeParse(rule, []).issues?.[0].message).toBe(
			"Selecciona al menos 1 opción.",
		);
	});

	test("un valor fuera de un vocabulario cerrado nombra la opcion", () => {
		const result = v.safeParse(v.picklist(["a", "b"]), "z");

		expect(result.issues?.[0].message).toBe(
			"La opción seleccionada no es válida.",
		);
	});
});

// La razon de ser del respaldo: es la red, no el mecanismo. El mensaje escrito
// en el `rules.ts` del modulo tiene que ganar siempre.
describe("precedencia", () => {
	test("el mensaje declarado en la accion gana sobre el respaldo", () => {
		const titled = v.pipe(
			v.string(),
			v.minLength(3, "El título debe tener al menos 3 caracteres."),
		);

		expect(v.safeParse(titled, "ab").issues?.[0].message).toBe(
			"El título debe tener al menos 3 caracteres.",
		);
	});
});

describe("sin ingles a la vista", () => {
	const cases: [string, v.GenericSchema, unknown][] = [
		["string", v.string(), 42],
		["number", v.number(), "x"],
		["boolean", v.boolean(), "x"],
		["date", v.date(), "x"],
		["array", v.array(v.string()), "x"],
		["object", v.object({}), "x"],
		["integer", v.pipe(v.number(), v.integer()), 1.5],
		["minValue", v.pipe(v.number(), v.minValue(1)), 0],
		["maxValue", v.pipe(v.number(), v.maxValue(1)), 2],
		["email", v.pipe(v.string(), v.email()), "no-es-correo"],
		["url", v.pipe(v.string(), v.url()), "no-es-url"],
		["uuid", v.pipe(v.string(), v.uuid()), "no-es-uuid"],
		["regex", v.pipe(v.string(), v.regex(/^\d+$/)), "abc"],
		["literal", v.literal("a"), "b"],
	];

	test.each(cases)(
		"%s no deja pasar el mensaje por defecto",
		(_, schema, input) => {
			const message = v.safeParse(schema, input).issues?.[0].message ?? "";

			expect(message).not.toMatch(/^Invalid /);
			expect(message).toMatch(/[áéíóúñ¿.]/);
		},
	);
});
