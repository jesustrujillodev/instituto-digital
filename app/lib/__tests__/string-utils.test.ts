import { describe, expect, test } from "vitest";
import {
	normalizeString,
	smartTruncate,
	toSlug,
	truncateText,
	truncateWords,
} from "../string-utils";

describe("toSlug", () => {
	test("lowercases and joins words with hyphens", () => {
		expect(toSlug("Gran Turismo Sport")).toBe("gran-turismo-sport");
	});

	// Lo que impide que "VW", "V.W." y "  volkswagen " convivan como tres marcas.
	test("collapses punctuation and surrounding whitespace", () => {
		expect(toSlug("  V.W.  ")).toBe("v-w");
		expect(toSlug("Clase C 200 / AMG")).toBe("clase-c-200-amg");
	});

	// "Citroën" y "Citroen" son la misma marca y en la práctica se teclean ambas.
	test("strips diacritics so both spellings collide", () => {
		expect(toSlug("Citroën")).toBe(toSlug("Citroen"));
		expect(toSlug("Citroën")).toBe("citroen");
	});

	test("never leaves a leading or trailing hyphen", () => {
		expect(toSlug("¡Híbrido!")).toBe("hibrido");
		expect(toSlug("--- x ---")).toBe("x");
	});

	test("returns an empty string for nothing usable", () => {
		expect(toSlug("")).toBe("");
		expect(toSlug("   ")).toBe("");
		expect(toSlug("///")).toBe("");
		expect(toSlug(null)).toBe("");
		expect(toSlug(undefined)).toBe("");
	});
});

describe("truncateText", () => {
	test("leaves a text shorter than the limit untouched", () => {
		expect(truncateText("Corto", 50)).toBe("Corto");
	});

	// El sufijo se descuenta del límite: el resultado NUNCA excede maxLength, que
	// es lo que permite usarlo para caber en una celda de ancho fijo.
	test("reserves room for the suffix inside the limit", () => {
		const result = truncateText("abcdefghij", 8);

		expect(result).toBe("abcde...");
		expect(result).toHaveLength(8);
	});

	test("a text exactly at the limit is not truncated", () => {
		expect(truncateText("abcde", 5)).toBe("abcde");
	});

	test("honours a custom suffix", () => {
		expect(truncateText("abcdefghij", 6, "…")).toBe("abcde…");
	});

	// null/undefined llegan de columnas nullable de la base: devolver "" evita
	// pintar "null" en la tabla.
	test("null and undefined become an empty string", () => {
		expect(truncateText(null)).toBe("");
		expect(truncateText(undefined)).toBe("");
		expect(truncateText("")).toBe("");
	});
});

describe("truncateWords", () => {
	test("cuts at the word limit and appends the suffix", () => {
		expect(truncateWords("uno dos tres cuatro", 2)).toBe("uno dos...");
	});

	test("a text at or below the word limit is returned as is", () => {
		expect(truncateWords("uno dos", 2)).toBe("uno dos");
	});

	// Los separadores se colapsan con \s+ al contar, así que saltos de línea y
	// espacios repetidos no inflan el número de palabras.
	test("collapses any run of whitespace when counting words", () => {
		expect(truncateWords("uno   dos\ntres", 2)).toBe("uno dos...");
	});

	// Bajo el límite devuelve el ORIGINAL, sin el trim que sí se aplicó al contar.
	// No es un descuido aprovechable: el texto que entra es el que sale.
	test("returns the original text — untrimmed — when under the limit", () => {
		expect(truncateWords("  uno dos  ", 5)).toBe("  uno dos  ");
	});

	test("null and undefined become an empty string", () => {
		expect(truncateWords(null)).toBe("");
		expect(truncateWords(undefined)).toBe("");
	});
});

describe("smartTruncate", () => {
	test("leaves a text shorter than the limit untouched", () => {
		expect(smartTruncate("Corto", 100)).toBe("Corto");
	});

	// La diferencia con truncateText: no parte una palabra por la mitad, retrocede
	// hasta el último espacio.
	test("backs off to the last whole word", () => {
		expect(smartTruncate("uno dos tres cuatro", 12)).toBe("uno dos...");
	});

	// Sin ningún espacio antes del límite no hay a dónde retroceder, así que corta
	// duro: es preferible a devolver el texto entero y romper el layout.
	test("falls back to a hard cut when there is no space to back off to", () => {
		const result = smartTruncate("abcdefghijklmnop", 10);

		expect(result).toBe("abcdefg...");
		expect(result).toHaveLength(10);
	});

	test("null and undefined become an empty string", () => {
		expect(smartTruncate(null)).toBe("");
		expect(smartTruncate(undefined)).toBe("");
	});
});

describe("normalizeString", () => {
	// Es la base de las búsquedas insensibles a acentos: "Muñoz" tiene que
	// encontrarse escribiendo "munoz".
	test("strips diacritics and lowercases", () => {
		expect(normalizeString("Múñóz Ávila")).toBe("munoz avila");
	});

	test("trims the surrounding whitespace", () => {
		expect(normalizeString("  Ana  ")).toBe("ana");
	});

	test("leaves a plain ascii text unchanged", () => {
		expect(normalizeString("ana")).toBe("ana");
	});

	test("null and undefined become an empty string", () => {
		expect(normalizeString(null)).toBe("");
		expect(normalizeString(undefined)).toBe("");
	});
});
