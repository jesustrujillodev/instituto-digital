import { describe, expect, test } from "vitest";
import { isCdnKey, isPublicKey } from "@/shared/storage/storage.policy";
import {
	COURSE_COVER,
	COURSE_COVER_HINT,
	COURSE_DEFAULTS,
	COURSE_LIST_DEFAULTS,
	COURSE_MAX_SESSIONS,
} from "../course.config";

describe("COURSE_LIST_DEFAULTS", () => {
	// Fuente única: loader, servicio y repositorio. Dos defaults distintos
	// producen una `pagination` que no describe la página consultada.
	test("es la fuente única de la paginación del listado", () => {
		expect(COURSE_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 12 });
	});
});

describe("COURSE_DEFAULTS", () => {
	test("la asistencia mínima por defecto es la de §6.8", () => {
		expect(COURSE_DEFAULTS.minAttendance).toBe(80);
	});
});

describe("COURSE_MAX_SESSIONS", () => {
	test("admite varias semanas de sesiones", () => {
		expect(COURSE_MAX_SESSIONS).toBeGreaterThanOrEqual(20);
	});
});

describe("COURSE_COVER", () => {
	const KEY = `${COURSE_COVER.prefix}/induccion-1784006709346.webp`;

	// Si el prefijo dejara de ser público, el catálogo pediría sesión para pintar
	// cada tarjeta; si dejara de ser de CDN, perdería la caché del navegador.
	test("su prefijo es público y elegible para CDN", () => {
		expect(isPublicKey(KEY)).toBe(true);
		expect(isCdnKey(KEY)).toBe(true);
	});

	test("cuelga de `media/` y no se apropia de la carpeta entera", () => {
		expect(COURSE_COVER.prefix.startsWith("media/")).toBe(true);
		expect(COURSE_COVER.prefix).not.toBe("media");
	});

	test("solo admite los formatos que todo navegador pinta", () => {
		expect(COURSE_COVER.allowedTypes).toEqual([
			"image/png",
			"image/jpeg",
			"image/webp",
		]);
		expect(COURSE_COVER.maxBytes).toBe(5 * 1024 * 1024);
	});

	test("la proporción es la que recorta el cliente y pinta la tarjeta", () => {
		expect(COURSE_COVER.aspectRatio).toBeCloseTo(16 / 9);
	});
});

describe("COURSE_COVER_HINT", () => {
	test("deriva el límite de COURSE_COVER.maxBytes", () => {
		const megabytes = COURSE_COVER.maxBytes / (1024 * 1024);

		expect(COURSE_COVER_HINT).toContain(`${megabytes} MB`);
		expect(COURSE_COVER_HINT).toContain("16:9");
	});
});
