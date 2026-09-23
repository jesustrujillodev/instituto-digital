import * as v from "valibot";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import { toProxyRef } from "@/shared/storage/public-url";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	CERTIFICATE_ACCENTS,
	CERTIFICATE_EXPORT_FORMATS,
	CERTIFICATE_SIGNATURE,
	CERTIFICATE_TEXT_LIMITS,
} from "./certificate.config";
import type {
	CertificateDesign,
	CertificateExportFormat,
	IssueCandidate,
	IssueDiff,
	StoredIssue,
} from "./certificate.types";

export const CERTIFICATE_TEMPLATE_IDS = [
	"institucional",
	"minima",
	"marco",
] as const;
export type CertificateTemplateId = (typeof CERTIFICATE_TEMPLATE_IDS)[number];

export const DEFAULT_TEMPLATE_ID: CertificateTemplateId = "institucional";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const text = (field: string, max: number) =>
	v.pipe(
		v.string(`${field} debe ser texto.`),
		v.trim(),
		v.maxLength(max, `${field} no puede superar los ${max} caracteres.`),
	);

export const certificateSignatorySchema = v.object({
	name: text("El nombre del firmante", CERTIFICATE_TEXT_LIMITS.signatoryName),
	role: text("El cargo del firmante", CERTIFICATE_TEXT_LIMITS.signatoryRole),
	enabled: v.boolean("Indica si el firmante aparece en el certificado."),
	signatureUrl: v.nullable(
		text("La firma", CERTIFICATE_TEXT_LIMITS.signatureUrl),
	),
});

/** Lo que el capacitador configura de su certificado. */
export const certificateDesignSchema = v.object({
	templateId: v.picklist(
		CERTIFICATE_TEMPLATE_IDS,
		"Elige una plantilla válida.",
	),
	accentColor: v.pipe(
		v.string("El color de acento debe ser texto."),
		v.regex(HEX_COLOR, "El color de acento debe tener la forma #RRGGBB."),
	),
	subtitle: text("El subtítulo", CERTIFICATE_TEXT_LIMITS.subtitle),
	description: text("La descripción", CERTIFICATE_TEXT_LIMITS.description),
	signatories: v.tuple(
		[certificateSignatorySchema, certificateSignatorySchema],
		"El certificado lleva exactamente dos firmantes.",
	),
	// Sin `{seq}` todos los folios del curso serían el mismo texto.
	folioFormat: v.pipe(
		text("El formato del folio", CERTIFICATE_TEXT_LIMITS.folioFormat),
		v.includes("{seq}", "El formato del folio debe incluir {seq}."),
	),
});

/**
 * La plantilla con la que se dibuja: la pedida si existe y, si no, la de por
 * defecto. Un diseño guardado con una plantilla que ya no existe sigue
 * imprimiéndose en vez de romper la emisión.
 */
export const resolveTemplateId = (
	value: string | null | undefined,
): CertificateTemplateId =>
	CERTIFICATE_TEMPLATE_IDS.find((id) => id === value) ?? DEFAULT_TEMPLATE_ID;

/**
 * El acento, solo si es un `#rrggbb`.
 *
 * Entra al CSS sin escapar —no hay escape posible dentro de una declaración—,
 * así que cualquier otra forma se descarta: `red;} body{…}` sería una inyección
 * de estilos con el diseño como vector.
 */
export const safeAccent = (value: string): string =>
	HEX_COLOR.test(value) ? value.toLowerCase() : CERTIFICATE_ACCENTS[0];

/**
 * Una imagen de firma, solo desde `https:` o desde el proxy de storage.
 *
 * `javascript:` y `data:` serían contenido arbitrario dentro del documento, y
 * `blob:` es una vista previa local que ningún otro navegador puede abrir.
 */
export const safeImageUrl = (value: string | null): string | null => {
	if (!value) return null;
	if (value.startsWith("/api/storage?")) return value;

	try {
		return new URL(value).protocol === "https:" ? value : null;
	} catch {
		return null;
	}
};

// ── Frontera del editor ───────────────────────────────────────────────────────

const courseDocumentId = v.pipe(
	v.string("Falta el identificador del curso."),
	v.uuid("El identificador del curso no es válido."),
);

const exportFormat = v.picklist(
	CERTIFICATE_EXPORT_FORMATS,
	"El formato debe ser PDF o PNG.",
);

export const certificateRules = {
	course: v.object({ documentId: courseDocumentId }),
	saveDraft: v.object({
		documentId: courseDocumentId,
		design: certificateDesignSchema,
	}),
	/** Solo el identificador y el formato: el diseño nunca viaja en la petición. */
	download: v.object({
		documentId: v.pipe(
			v.string("Falta el identificador del certificado."),
			v.uuid("El identificador del certificado no es válido."),
		),
		format: exportFormat,
	}),
	sample: v.object({
		documentId: courseDocumentId,
		version: v.picklist(
			["draft", "published"],
			"La versión debe ser la guardada o la publicada.",
		),
		format: exportFormat,
	}),
} as const;

// ── Reglas del editor ─────────────────────────────────────────────────────────

/**
 * Un cancelado ya no cambia. Un finalizado sí: la emisión congela el diseño,
 * así que editarlo solo alcanza a las emisiones que vengan (F-09).
 */
export const canEditCertificate = (status: CourseStatus): boolean =>
	status !== "CANCELLED";

/** Carpeta de las firmas de un curso, con su barra final. */
export const signatureFolderOf = (courseDocumentId: string): string =>
	`${CERTIFICATE_SIGNATURE.prefix}/${courseDocumentId}/`;

/** El curso dueño de una key de firma, o null si la key no es de firmas. */
export const courseOfSignatureKey = (key: string): string | null => {
	const root = `${CERTIFICATE_SIGNATURE.prefix}/`;
	if (!key.startsWith(root)) return null;

	const [courseDocumentId, file] = key.slice(root.length).split("/");
	return courseDocumentId && file ? courseDocumentId : null;
};

/**
 * Lo único que un diseño puede guardar como firma: la referencia del proxy de
 * una key bajo la carpeta de ESTE curso.
 *
 * Deja fuera la vista previa local (`blob:`, `data:`), las URLs externas y las
 * firmas de otro curso: con estas últimas, cualquiera que administre un curso
 * imprimiría la firma de un titular ajeno.
 */
export const isOwnSignatureRef = (
	ref: string,
	courseDocumentId: string,
): boolean => {
	if (!ref.startsWith("/api/storage?")) return false;

	const key = getKeyFromUrl(ref);
	return (
		key !== null &&
		!key.includes("..") &&
		courseOfSignatureKey(key) === courseDocumentId &&
		toProxyRef(key) === ref
	);
};

const pad = (value: number, length: number) =>
	String(value).padStart(length, "0");

/**
 * El folio con sus tokens resueltos: `{seq}` a cuatro cifras, `{year}` y
 * `{month}` a dos. El editor lo usa con el primer consecutivo para la vista
 * previa, y la emisión (F-09) con el real.
 */
export const resolveFolio = (
	format: string,
	{ seq, year, month }: { seq: number; year: number; month: number },
): string =>
	format
		.replaceAll("{seq}", pad(seq, 4))
		.replaceAll("{year}", String(year))
		.replaceAll("{month}", pad(month, 2));

const channelLuminance = (value: number) => {
	const srgb = value / 255;
	return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

/** Razón de contraste WCAG entre el acento y el blanco del logo. */
export const accentContrastWithWhite = (hex: string): number => {
	const accent = safeAccent(hex);
	const [r, g, b] = [1, 3, 5].map((offset) =>
		channelLuminance(Number.parseInt(accent.slice(offset, offset + 2), 16)),
	);
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

	return 1.05 / (luminance + 0.05);
};

/** Serialización con las claves ordenadas: el orden no es un cambio. */
const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, canonical(entry)]),
		);
	}
	return value;
};

/** Dos diseños iguales en contenido, sin importar el orden de sus claves. */
export const designsEqual = (
	a: CertificateDesign,
	b: CertificateDesign,
): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export type CertificateState =
	| "never-published"
	| "published"
	| "unpublished-changes";

/** Lo que enseña la cabecera del editor, derivado del par guardado. */
export const certificateStateOf = ({
	draft,
	published,
}: {
	draft: CertificateDesign;
	published: CertificateDesign | null;
}): CertificateState => {
	if (!published) return "never-published";
	return designsEqual(draft, published) ? "published" : "unpublished-changes";
};

/**
 * Qué cambia en las emisiones de un curso para que coincidan con quién completó.
 *
 * La misma semántica que `diffCredits`: una emisión retirada se restaura —con su
 * folio y sus snapshots— en lugar de emitirse otra, porque es el mismo documento.
 */
export const diffIssues = (
	existing: readonly StoredIssue[],
	completed: readonly IssueCandidate[],
): IssueDiff => {
	const byUser = new Map(existing.map((issue) => [issue.userId, issue]));
	const completedIds = new Set(completed.map((candidate) => candidate.userId));

	const issue: IssueCandidate[] = [];
	const restore: number[] = [];

	for (const candidate of completed) {
		const current = byUser.get(candidate.userId);
		if (!current) issue.push(candidate);
		else if (current.revokedAt !== null) restore.push(candidate.userId);
	}

	const revoke = existing
		.filter(
			(stored) => stored.revokedAt === null && !completedIds.has(stored.userId),
		)
		.map((stored) => stored.userId);

	return { issue, restore, revoke };
};

/** `certificado-2026-0001.pdf`: el folio sin lo que un nombre de archivo no admite. */
export const certificateFileName = (
	folio: string,
	format: CertificateExportFormat,
): string => {
	const safe = folio
		.replace(/[^\p{L}\p{N}._-]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return `certificado-${safe || "sin-folio"}.${format}`;
};
