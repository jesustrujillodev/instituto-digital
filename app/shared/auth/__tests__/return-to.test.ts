import { describe, expect, test } from "vitest";
import { checkInPathOf } from "@/modules/check-in/domain/check-in.config";
import { isSafeReturnTo, safeReturnTo } from "../return-to";

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("isSafeReturnTo", () => {
	test("acepta la ruta de asistencia con un token bien formado", () => {
		expect(isSafeReturnTo(`/asistencia/${TOKEN}`)).toBe(true);
		expect(isSafeReturnTo("/asistencia/aB3-_aB3-_aB3-_aB3-_aB3-_aB3-_aB")).toBe(
			true,
		);
	});

	// Si `checkInPathOf` cambiara de forma, la allowlist dejaría de casar y el
	// login mandaría al dashboard en silencio. Este caso lo hace ruidoso.
	test("acepta lo que produce checkInPathOf", () => {
		expect(isSafeReturnTo(checkInPathOf(TOKEN))).toBe(true);
	});

	test.each([
		["//evil.com", "protocol-relative"],
		["https://evil.com", "absoluta"],
		[`http://evil.com/asistencia/${TOKEN}`, "absoluta con la ruta dentro"],
		["/\\evil.com", "barra invertida"],
		["/dashboard", "otra ruta interna"],
		["/", "raíz"],
		["/asistencia/", "sin token"],
		[`/asistencia/${TOKEN}extra`, "token largo"],
		[`/asistencia/${"A".repeat(31)}`, "token corto"],
		[`/asistencia/${TOKEN}?next=/admin`, "con query colgando"],
		[`/asistencia/${TOKEN}#x`, "con fragmento"],
		["/asistencia/../dashboard", "con salto de directorio"],
		["/asistencia/AAAA AAAA AAAA AAAA AAAA AAAA AAAA", "con espacios"],
		["", "vacía"],
	])("rechaza %s (%s)", (value) => {
		expect(isSafeReturnTo(value)).toBe(false);
	});

	test("rechaza lo que no es una cadena", () => {
		expect(isSafeReturnTo(null)).toBe(false);
		expect(isSafeReturnTo(undefined)).toBe(false);
		expect(isSafeReturnTo(new File([], "x"))).toBe(false);
		expect(isSafeReturnTo({ toString: () => `/asistencia/${TOKEN}` })).toBe(
			false,
		);
	});
});

describe("safeReturnTo", () => {
	test("devuelve el destino válido tal cual", () => {
		expect(safeReturnTo(`/asistencia/${TOKEN}`, "/dashboard")).toBe(
			`/asistencia/${TOKEN}`,
		);
	});

	test("cae en el destino de reserva ante cualquier otra cosa", () => {
		expect(safeReturnTo("https://evil.com", "/dashboard")).toBe("/dashboard");
		expect(safeReturnTo(null, "/dashboard")).toBe("/dashboard");
	});
});
