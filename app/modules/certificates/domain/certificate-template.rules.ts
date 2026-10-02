import * as v from "valibot";
import { toProxyRef } from "@/shared/storage/public-url";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	CERTIFICATE_ASSETS,
	type CertificateAssetFolder,
} from "./certificate-assets.rules";
import type { CertificateDesignV2 } from "./design/design-v2.schema";
import { designV2Schema } from "./design/design-v2.schema";

export const CERTIFICATE_TEMPLATE = {
	prefix: "documentos/plantillas-certificado",
	nameMax: 80,
	descriptionMax: 300,
} as const;

/** Carpeta de un tipo de recurso de la plantilla, sin barra final. */
export const templateAssetFolderOf = (
	templateDocumentId: string,
	folder: CertificateAssetFolder,
): string =>
	`${CERTIFICATE_TEMPLATE.prefix}/${templateDocumentId}/${CERTIFICATE_ASSETS.folders[folder]}`;

const FOLDER_NAMES = new Set<string>(Object.values(CERTIFICATE_ASSETS.folders));

/** La plantilla dueña de una key, o null si la key no es de plantillas. */
export const templateOfAssetKey = (key: string): string | null => {
	const root = `${CERTIFICATE_TEMPLATE.prefix}/`;
	if (!key.startsWith(root) || key.includes("..")) return null;
	const [template, folder, file, ...rest] = key.slice(root.length).split("/");
	return template && FOLDER_NAMES.has(folder) && file && rest.length === 0
		? template
		: null;
};

/** Lo único que una plantilla guarda como imagen: lo subido a ELLA. */
export const isOwnTemplateAssetRef = (
	ref: string,
	templateDocumentId: string,
): boolean => {
	if (!ref.startsWith("/api/storage?")) return false;
	const key = getKeyFromUrl(ref);
	return (
		key !== null &&
		templateOfAssetKey(key) === templateDocumentId &&
		toProxyRef(key) === ref
	);
};

/**
 * El diseño sin firmas. Una plantilla se comparte con otros cursos: no puede
 * repartir la firma de un titular.
 */
export const withoutSignatures = (
	design: CertificateDesignV2,
): CertificateDesignV2 => ({
	...design,
	elements: design.elements.filter(
		(element) =>
			!(
				element.type === "image" &&
				element.src.kind === "asset" &&
				element.src.role === "signature"
			),
	),
});

/** El diseño con sus referencias a storage cambiadas por las de sus copias. */
export const rewriteAssetRefs = (
	design: CertificateDesignV2,
	copies: ReadonlyMap<string, string>,
): CertificateDesignV2 => {
	const swap = (ref: string) => copies.get(ref) ?? ref;
	const { background } = design;
	return {
		...design,
		background:
			background.kind === "pdf"
				? {
						...background,
						pdfRef: swap(background.pdfRef),
						rasterRef: swap(background.rasterRef),
					}
				: background,
		elements: design.elements.map((element) =>
			element.type === "image" && element.src.kind === "asset"
				? { ...element, src: { ...element.src, ref: swap(element.src.ref) } }
				: element,
		),
	};
};

// ── Frontera ──────────────────────────────────────────────────────────────────

const uuid = (label: string) =>
	v.pipe(
		v.string(`Falta el identificador de ${label}.`),
		v.uuid(`El identificador de ${label} no es válido.`),
	);

const name = v.pipe(
	v.string("El nombre de la plantilla debe ser texto."),
	v.trim(),
	v.nonEmpty("Escribe el nombre de la plantilla."),
	v.maxLength(
		CERTIFICATE_TEMPLATE.nameMax,
		`El nombre de la plantilla no puede superar los ${CERTIFICATE_TEMPLATE.nameMax} caracteres.`,
	),
);

const description = v.nullable(
	v.pipe(
		v.string("La descripción de la plantilla debe ser texto."),
		v.trim(),
		v.maxLength(
			CERTIFICATE_TEMPLATE.descriptionMax,
			`La descripción de la plantilla no puede superar los ${CERTIFICATE_TEMPLATE.descriptionMax} caracteres.`,
		),
	),
);

export const certificateTemplateRules = {
	target: v.object({ documentId: uuid("la plantilla") }),
	create: v.object({ name, description }),
	rename: v.object({ documentId: uuid("la plantilla"), name, description }),
	saveDesign: v.object({
		documentId: uuid("la plantilla"),
		design: designV2Schema,
	}),
	archive: v.object({
		documentId: uuid("la plantilla"),
		archived: v.boolean("Indica si la plantilla se archiva."),
	}),
	/** Guardar el diseño de un curso como plantilla de la biblioteca. */
	fromCourse: v.object({
		courseDocumentId: uuid("la capacitación"),
		name,
		description,
		design: designV2Schema,
	}),
	/** Partir de una plantilla en el certificado de un curso. */
	apply: v.object({
		courseDocumentId: uuid("la capacitación"),
		templateDocumentId: uuid("la plantilla"),
	}),
} as const;

export type CreateTemplateDto = v.InferOutput<
	typeof certificateTemplateRules.create
>;
export type RenameTemplateDto = v.InferOutput<
	typeof certificateTemplateRules.rename
>;
export type SaveTemplateDesignDto = v.InferOutput<
	typeof certificateTemplateRules.saveDesign
>;
export type TemplateFromCourseDto = v.InferOutput<
	typeof certificateTemplateRules.fromCourse
>;
export type ApplyTemplateDto = v.InferOutput<
	typeof certificateTemplateRules.apply
>;

/** El curso de muestra con el que se ve una plantilla: no pertenece a nadie. */
export const TEMPLATE_SAMPLE_COURSE = {
	id: 0,
	documentId: "00000000-0000-4000-8000-000000000000",
	status: "DRAFT",
	title: "Nombre de la capacitación",
	description:
		"Descripción de la capacitación: aquí se imprime la que tenga cada curso.",
	dependencyName: "Nombre de la dependencia",
	hours: 20,
} as const;
