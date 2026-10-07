import { describe, expect, test } from "vitest";
import {
	invalidationChannel,
	rateLimitKey,
	signedUrlKey,
} from "../redis.keys.server";

const urlParts = {
	bucket: "documentos",
	key: "lecciones/manual-1700000000.pdf",
	disposition: "inline",
	signTtlS: 21_600,
};

describe("rateLimitKey", () => {
	test("es determinista y conserva el dominio legible", () => {
		const key = rateLimitKey("auth:login:email:ana@instituto.gob.mx");

		expect(key).toBe(rateLimitKey("auth:login:email:ana@instituto.gob.mx"));
		expect(key).toMatch(/^rl:v1:auth:[\w-]{32}$/);
	});

	test("el identificador nunca queda en claro", () => {
		const key = rateLimitKey("auth:login:email:ana@instituto.gob.mx");

		expect(key).not.toContain("ana");
		expect(key).not.toContain("instituto.gob.mx");
	});

	test("claves lógicas distintas no chocan", () => {
		expect(rateLimitKey("check-in:10.0.0.1")).not.toBe(
			rateLimitKey("check-in:10.0.0.2"),
		);
	});
});

describe("signedUrlKey", () => {
	test("es determinista y no expone la key del objeto", () => {
		const key = signedUrlKey(urlParts);

		expect(key).toBe(signedUrlKey({ ...urlParts }));
		expect(key).toMatch(/^su:v1:[\w-]{32}$/);
		expect(key).not.toContain("manual");
	});

	// Una URL de descarga no sirve para ver en línea, y una firmada por 5 min no
	// puede responder a quien pidió 6 h.
	test("cambia con la disposición y con la vida de la firma", () => {
		expect(signedUrlKey({ ...urlParts, disposition: "attachment" })).not.toBe(
			signedUrlKey(urlParts),
		);
		expect(signedUrlKey({ ...urlParts, signTtlS: 300 })).not.toBe(
			signedUrlKey(urlParts),
		);
	});

	test("el separador no permite fabricar una colisión", () => {
		expect(signedUrlKey({ ...urlParts, bucket: "a", key: "b\0c" })).not.toBe(
			signedUrlKey({ ...urlParts, bucket: "a\0b", key: "c" }),
		);
	});
});

describe("invalidationChannel", () => {
	test("lleva el prefijo del entorno, que ioredis no pone en los canales", () => {
		expect(invalidationChannel("idc:", "security-state:invalidate")).toBe(
			"idc:inv:v1:security-state:invalidate",
		);
	});
});
