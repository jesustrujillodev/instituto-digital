import { describe, expect, test } from "vitest";
import type { CertificateRenderData } from "../certificate.types";
import {
	literalText,
	resolveTokens,
	tokensOf,
	unknownTokensOf,
} from "../design/design.tokens";

const DATA: CertificateRenderData = {
	recipientName: "Ana {folio}",
	courseTitle: "Excel",
	courseDescription: "",
	dependencyName: "DIF",
	hours: null,
	issuedOn: "1 de octubre de 2026",
	folio: "2026-0001",
};

describe("campos dinámicos", () => {
	test("resuelve los campos conocidos en una sola pasada", () => {
		expect(resolveTokens("{participante} · {folio}", DATA)).toBe(
			"Ana {folio} · 2026-0001",
		);
	});

	test("un campo sin valor omite el texto entero", () => {
		expect(resolveTokens("Con una duración de {horas}", DATA)).toBeNull();
		expect(resolveTokens("{descripcion}", DATA)).toBeNull();
	});

	test("lo que no es un campo queda tal cual", () => {
		expect(resolveTokens("{nombre} y {}", DATA)).toBe("{nombre} y {}");
	});

	test("distingue campos conocidos y desconocidos", () => {
		expect(tokensOf("{fecha} {nombre}")).toEqual(["fecha"]);
		expect(unknownTokensOf("{fecha} {nombre}")).toEqual(["nombre"]);
	});

	test("desarma las llaves de un texto heredado que no son campos", () => {
		expect(literalText("Lic. {Juan} {participante} {x}")).toBe(
			"Lic. {Juan} {participante} (x)",
		);
	});
});
