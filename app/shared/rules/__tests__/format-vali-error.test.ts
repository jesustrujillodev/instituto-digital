import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { toFieldErrors } from "../format-vali-error";

/** Incidencias reales de valibot: se provocan parseando, no se fabrican a mano. */
const issuesOf = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	if (result.success) throw new Error("el input debía fallar la validación");
	return result.issues;
};

describe("toFieldErrors", () => {
	test("maps each field to its message", () => {
		const schema = v.object({
			email: v.pipe(v.string(), v.email("Correo inválido")),
			age: v.pipe(v.number(), v.minValue(18, "Muy joven")),
		});

		const fieldErrors = toFieldErrors(
			issuesOf(schema, { email: "x", age: 10 }),
		);

		expect(fieldErrors).toEqual({ email: "Correo inválido", age: "Muy joven" });
	});

	// Apilar tres mensajes bajo un mismo input no ayuda a corregirlo: gana el
	// primero y el resto se descarta.
	test("keeps only the FIRST message per field", () => {
		const schema = v.object({
			password: v.pipe(
				v.string(),
				v.minLength(8, "Mínimo 8 caracteres"),
				v.regex(/[A-Z]/, "Falta una mayúscula"),
			),
		});

		const fieldErrors = toFieldErrors(issuesOf(schema, { password: "abc" }));

		expect(fieldErrors.password).toBe("Mínimo 8 caracteres");
	});

	// Los campos anidados se aplanan con puntos: es la clave que espera el
	// formulario para colgar el error de su input.
	test("joins a nested path with dots", () => {
		const schema = v.object({
			owner: v.object({
				email: v.pipe(v.string(), v.email("Correo inválido")),
			}),
		});

		const fieldErrors = toFieldErrors(
			issuesOf(schema, { owner: { email: "x" } }),
		);

		expect(fieldErrors["owner.email"]).toBe("Correo inválido");
	});

	// Una validación cruzada sin `forward` no pertenece a ningún campo. Se
	// descarta a propósito: el action la trata como error general, y colgarla de
	// un input arbitrario la pintaría en el sitio equivocado.
	test("drops issues that carry no path", () => {
		const schema = v.pipe(
			v.object({ a: v.string(), b: v.string() }),
			v.check((input) => input.a === input.b, "No coinciden"),
		);

		expect(toFieldErrors(issuesOf(schema, { a: "1", b: "2" }))).toEqual({});
	});

	test("an empty list of issues produces an empty map", () => {
		expect(toFieldErrors([])).toEqual({});
	});
});
