import { describe, expect, test } from "vitest";
import { formatAccessLine, redactAccessUrl } from "../access-log";

describe("redactAccessUrl", () => {
	// Remediación (Fase C): morgan escribía la URL completa.
	test("oculta el token de los QR de asistencia e inscripción", () => {
		expect(redactAccessUrl("/asistencia/9f8e7d6c5b4a")).toBe(
			"/asistencia/:token",
		);
		expect(redactAccessUrl("/inscripcion/abc.def-123")).toBe(
			"/inscripcion/:token",
		);
		expect(redactAccessUrl("/asistencia/9f8e7d6c5b4a.data")).toBe(
			"/asistencia/:token.data",
		);
	});

	test("quita la consulta: la key de storage y el redirectTo con el token", () => {
		expect(redactAccessUrl("/api/storage?key=documentos/x.pdf")).toBe(
			"/api/storage?…",
		);
		expect(
			redactAccessUrl("/iniciar-sesion?redirectTo=%2Fasistencia%2Fsecreto"),
		).toBe("/iniciar-sesion?…");
	});

	test("deja igual las demás rutas", () => {
		expect(redactAccessUrl("/dashboard/usuarios")).toBe("/dashboard/usuarios");
		expect(redactAccessUrl("/asistencia")).toBe("/asistencia");
		expect(redactAccessUrl("/dashboard/asistencia/curso/x")).toBe(
			"/dashboard/asistencia/curso/x",
		);
	});
});

describe("formatAccessLine", () => {
	test("método, URL sin credenciales, estado, tamaño y tiempo", () => {
		expect(
			formatAccessLine({
				method: "GET",
				url: "/asistencia/secreto?x=1",
				status: 302,
				contentLength: undefined,
				ms: 12.3456,
			}),
		).toBe("GET /asistencia/:token?… 302 - - 12.346 ms");
	});
});
