import * as v from "valibot";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import {
	CERTIFICATE_ACCENTS,
	CERTIFICATE_EMAIL_MESSAGE_MAX,
	CERTIFICATE_EXPORT_FORMATS,
} from "./certificate.config";
import type {
	CertificateDesign,
	CertificateExportFormat,
	IssueCandidate,
	IssueDiff,
	StoredIssue,
} from "./certificate.types";
import { safeColor } from "./design/color";
import {
	CERTIFICATE_TEMPLATE_IDS,
	type CertificateTemplateId,
	DEFAULT_TEMPLATE_ID,
} from "./design/design-v1.schema";
import { designV2Schema } from "./design/design-v2.schema";

export {
	CERTIFICATE_TEMPLATE_IDS,
	type CertificateTemplateId,
	certificateSignatorySchema,
	DEFAULT_TEMPLATE_ID,
} from "./design/design-v1.schema";

/**
 * El diseño que acepta la frontera del editor: solo v2. Un v1 se sigue leyendo
 * (snapshots, borradores viejos), pero ya no se escribe.
 */
export const certificateDesignSchema = designV2Schema;

/**
 * La plantilla con la que se dibuja: la pedida si existe y, si no, la de por
 * defecto. Un diseño guardado con una plantilla que ya no existe sigue
 * imprimiéndose en vez de romper la emisión.
 */
export const resolveTemplateId = (
	value: string | null | undefined,
): CertificateTemplateId =>
	CERTIFICATE_TEMPLATE_IDS.find((id) => id === value) ?? DEFAULT_TEMPLATE_ID;

/** El acento, solo si es un `#rrggbb` (`safeColor`). */
export const safeAccent = (value: string): string =>
	safeColor(value, CERTIFICATE_ACCENTS[0]);

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
	v.string("Falta el identificador de la capacitación."),
	v.uuid("El identificador de la capacitación no es válido."),
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
	/** Un identificador malformado se trata como inexistente: no hay 400 que distinga. */
	verify: v.object({
		documentId: v.pipe(
			v.string("Falta el identificador del certificado."),
			v.uuid("El identificador del certificado no es válido."),
		),
	}),
	delivery: v.object({
		documentId: courseDocumentId,
		isDownloadable: v.boolean("Indica si el participante puede descargarlo."),
		emailMessage: v.nullable(
			v.pipe(
				v.string("El mensaje del correo debe ser texto."),
				v.trim(),
				v.maxLength(
					CERTIFICATE_EMAIL_MESSAGE_MAX,
					`El mensaje del correo no puede superar los ${CERTIFICATE_EMAIL_MESSAGE_MAX} caracteres.`,
				),
			),
		),
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
