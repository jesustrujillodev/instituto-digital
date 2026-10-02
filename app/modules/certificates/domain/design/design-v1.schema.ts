import * as v from "valibot";
import { HEX_COLOR } from "./color";

// ===============================================================
// Diseño v1: el gestor de plantillas (ADR 0017/0018)
// ===============================================================
// CONGELADO. Lo leen los snapshots de certificados ya emitidos, y un blob que
// deje de validar cae al diseño de reserva y cambia de aspecto. Por eso los
// topes van como literales y no desde la configuración: nada de aquí se edita.

export const CERTIFICATE_TEMPLATE_IDS = [
	"institucional",
	"minima",
	"marco",
] as const;
export type CertificateTemplateId = (typeof CERTIFICATE_TEMPLATE_IDS)[number];

export const DEFAULT_TEMPLATE_ID: CertificateTemplateId = "institucional";

const text = (field: string, max: number) =>
	v.pipe(
		v.string(`${field} debe ser texto.`),
		v.trim(),
		v.maxLength(max, `${field} no puede superar los ${max} caracteres.`),
	);

export const certificateSignatorySchema = v.object({
	name: text("El nombre del firmante", 80),
	role: text("El cargo del firmante", 80),
	enabled: v.boolean("Indica si el firmante aparece en el certificado."),
	signatureUrl: v.nullable(text("La firma", 500)),
});

export const designV1Schema = v.object({
	templateId: v.picklist(
		CERTIFICATE_TEMPLATE_IDS,
		"Elige una plantilla válida.",
	),
	accentColor: v.pipe(
		v.string("El color de acento debe ser texto."),
		v.regex(HEX_COLOR, "El color de acento debe tener la forma #RRGGBB."),
	),
	subtitle: text("El subtítulo", 120),
	description: text("La descripción", 400),
	signatories: v.tuple(
		[certificateSignatorySchema, certificateSignatorySchema],
		"El certificado lleva exactamente dos firmantes.",
	),
	// Sin `{seq}` todos los folios del curso serían el mismo texto.
	folioFormat: v.pipe(
		text("El formato del folio", 40),
		v.includes("{seq}", "El formato del folio debe incluir {seq}."),
	),
});

export type CertificateDesignV1 = v.InferOutput<typeof designV1Schema>;
export type CertificateSignatory = v.InferOutput<
	typeof certificateSignatorySchema
>;

/**
 * El diseño v1 que sustituye a un snapshot ilegible. Congelado: si siguiera al
 * diseño por defecto del editor, un snapshot roto cambiaría de aspecto cuando
 * cambie ese default.
 */
export const LEGACY_DEFAULT_DESIGN_V1: CertificateDesignV1 = {
	templateId: "institucional",
	accentColor: "#750d2f",
	subtitle: "",
	description: "",
	signatories: [
		{
			name: "Nombre de quien imparte",
			role: "Capacitador",
			enabled: true,
			signatureUrl: null,
		},
		{
			name: "Nombre de quien dirige",
			role: "Titular de la dependencia",
			enabled: true,
			signatureUrl: null,
		},
	],
	folioFormat: "{year}-{seq}",
};
