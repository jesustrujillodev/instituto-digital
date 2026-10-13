import { describe, expect, test } from "vitest";
import {
	ANONYMOUS_BODY_MAX_BYTES,
	AUTHENTICATED_BODY_MAX_BYTES,
	bodyLimitStatusOf,
} from "../body-limit";

const MB = 1024 * 1024;

const postOf = (headers: Record<string, string>, method = "POST") =>
	new Request("https://app.example.com/iniciar-sesion", { method, headers });

describe("bodyLimitStatusOf", () => {
	// El hallazgo: 8 MB anónimos se leían completos antes de validar. Se decide
	// por la cabecera, sin tocar el cuerpo.
	test("un cuerpo anónimo de 8 MB se rechaza con 413 sin leerlo", () => {
		const request = postOf({ "Content-Length": String(8 * MB) });

		expect(bodyLimitStatusOf(request, false)).toBe(413);
		expect(request.bodyUsed).toBe(false);
	});

	test("sin sesión, el tope es de 64 KiB", () => {
		expect(
			bodyLimitStatusOf(
				postOf({ "Content-Length": String(ANONYMOUS_BODY_MAX_BYTES) }),
				false,
			),
		).toBeNull();
		expect(
			bodyLimitStatusOf(
				postOf({ "Content-Length": String(ANONYMOUS_BODY_MAX_BYTES + 1) }),
				false,
			),
		).toBe(413);
	});

	// El fondo raster del certificado admite 15 MB y es la subida más grande que
	// pasa por el servidor; el material y los videos van directo al bucket.
	test("con sesión, una subida de 15 MB pasa y el tope es de 16 MiB", () => {
		expect(
			bodyLimitStatusOf(postOf({ "Content-Length": String(15 * MB) }), true),
		).toBeNull();
		expect(
			bodyLimitStatusOf(
				postOf({ "Content-Length": String(AUTHENTICATED_BODY_MAX_BYTES + 1) }),
				true,
			),
		).toBe(413);
	});

	// Sin Content-Length el tamaño solo se conoce leyendo: se exige la cabecera,
	// que el navegador siempre manda al enviar un formulario.
	test("un cuerpo por trozos sin Content-Length se rechaza con 411", () => {
		expect(
			bodyLimitStatusOf(postOf({ "Transfer-Encoding": "chunked" }), true),
		).toBe(411);
	});

	test("un Content-Length que no es un número se rechaza con 411", () => {
		expect(bodyLimitStatusOf(postOf({ "Content-Length": "abc" }), false)).toBe(
			411,
		);
	});

	test("una escritura sin cuerpo pasa", () => {
		expect(bodyLimitStatusOf(postOf({}, "DELETE"), false)).toBeNull();
	});

	test("las lecturas no se miden", () => {
		const request = new Request("https://app.example.com/x", {
			headers: { "Content-Length": String(8 * MB) },
		});

		expect(bodyLimitStatusOf(request, false)).toBeNull();
	});
});
