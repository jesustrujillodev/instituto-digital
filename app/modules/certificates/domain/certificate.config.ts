/**
 * Lienzo de las plantillas v1, en píxeles. Congelado con ellas: el v2 mide su
 * página en puntos (`design/design-v2.config.ts`).
 */
export const CERTIFICATE_CANVAS = { width: 1100, height: 780 } as const;

/**
 * Acentos ofrecidos, tomados del manual de identidad.
 * Todos son oscuros: el logo del Ayuntamiento es blanco y va sobre el acento.
 */
export const CERTIFICATE_ACCENTS = [
	"#750d2f",
	"#912240",
	"#225b4f",
	"#ba945c",
	"#383838",
] as const;

/** Logo del Ayuntamiento, blanco. Se resuelve contra `assetBaseUrl`. */
export const CERTIFICATE_LOGO_PATH = "/assets/aytoBco.png";

/** Carpeta de la ITC Avant Garde auto-hospedada, la misma de `app.css`. */
export const CERTIFICATE_FONT_DIR = "/font";

/** Los cortes de la ITC Avant Garde: sufijo del archivo y peso CSS. */
export const CERTIFICATE_FONT_FILES = [
	["XLt", 200],
	["Bk", 400],
	["Md", 500],
	["Demi", 600],
	["Bold", 700],
] as const;
export type CertificateFontFile = (typeof CERTIFICATE_FONT_FILES)[number][0];

/**
 * Carpeta de las firmas del gestor anterior: `documentos/firmas/<curso>/x`.
 * Ya no se sube nada aquí, pero los diseños v1 y sus emisiones las imprimen.
 */
export const CERTIFICATE_SIGNATURE = { prefix: "documentos/firmas" } as const;

/** Quien «recibe» el certificado en la vista previa del editor. */
export const CERTIFICATE_SAMPLE_RECIPIENT = "Nombre del participante";

/** Por debajo, el logo blanco deja de leerse sobre el acento (WCAG, gráficos). */
export const CERTIFICATE_MIN_LOGO_CONTRAST = 3;

// ── Emisión y exportación (F-09) ──────────────────────────────────────────────

/** La única fila de `certificate_folio_counter`. */
export const CERTIFICATE_FOLIO_COUNTER_ID = "folio";

export const CERTIFICATE_EXPORT_FORMATS = ["pdf", "png"] as const;

export const CERTIFICATE_EXPORT = {
	timeoutMs: 20_000,
	/** Páginas abiertas a la vez; cada una pide su propia memoria a Chromium. */
	maxConcurrentPages: 2,
	contentTypes: { pdf: "application/pdf", png: "image/png" },
} as const;

// ── Verificación pública (F-10) ───────────────────────────────────────────────

/**
 * La ruta pública que codifica el QR, relativa al origen. Lleva el `documentId`
 * de la emisión y no el folio: el folio es consecutivo y se podría recorrer.
 */
export const verificationPathOf = (issueDocumentId: string): string =>
	`/verificar/${issueDocumentId}`;

/** Lo que codifica el QR de la vista previa y de la muestra: no verifica nada. */
export const CERTIFICATE_SAMPLE_VERIFICATION_PATH = verificationPathOf(
	"00000000-0000-4000-8000-000000000000",
);

/** Por IP. Frena a quien pruebe UUID a ciegas sin molestar a quien escanea. */
export const CERTIFICATE_VERIFY_RATE_LIMIT = {
	limit: 30,
	windowMs: 60_000,
} as const;

/** Lado del QR en el lienzo: ~2 cm impreso, legible con cualquier teléfono. */
export const CERTIFICATE_QR_SIZE = 80;

// ── Entrega al participante (F-11) ────────────────────────────────────────────

/** Tope del mensaje que el curso añade al correo de la emisión. */
export const CERTIFICATE_EMAIL_MESSAGE_MAX = 500;

export const MY_CERTIFICATES_PATH = "/dashboard/mis-certificados";
