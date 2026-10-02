import { CERTIFICATE_ACCENTS } from "../certificate.config";
import { shade } from "../templates/shared";
import { safeColor } from "./color";
import { literalText } from "./design.tokens";
import type {
	CertificateDesignV1,
	CertificateSignatory,
	CertificateTemplateId,
} from "./design-v1.schema";
import { PAGE_PRESETS } from "./design-v2.config";
import type {
	CertificateDesignV2,
	DesignElement,
	FolioElement,
	ImageElement,
	ShapeElement,
	TextElement,
} from "./design-v2.schema";

// ===============================================================
// Diseños de partida
// ===============================================================
// Las tres plantillas del gestor anterior, rehechas como documentos de
// elementos. Las medidas salen del v1 dibujado en Chromium a 1100×780 px y se
// llevan a A4 horizontal: por eso cada coordenada se escribe en px del v1.

const { widthPt, heightPt } = PAGE_PRESETS.A4;
const round = (value: number) => Math.round(value * 100) / 100;
const px = (value: number) => round((value * widthPt) / 1100);
const py = (value: number) => round((value * heightPt) / 780);
/** Cuerpo de letra del v1 (px) en pt, con la misma escala horizontal. */
const fs = (value: number) => round(value * 0.75 * (widthPt / 825));

const INK = "#383838";
const MUTED = "#6b6b6b";
const BODY = "#555555";
const NAME = "#1f1f1f";
const WHITE = "#ffffff";

type Box = [x: number, y: number, w: number, h: number];

const base = (id: string, name: string, [x, y, w, h]: Box) => ({
	id,
	name,
	x: px(x),
	y: py(y),
	w: px(w),
	h: py(h),
	rotation: 0,
	opacity: 1,
	locked: false,
	hidden: false,
});

type TextStyle = Partial<
	Omit<TextElement, "id" | "name" | "type" | "content" | "x" | "y" | "w" | "h">
>;

const text = (
	id: string,
	name: string,
	box: Box,
	content: string,
	style: TextStyle & { sizePx: number },
): TextElement => {
	const { sizePx, ...rest } = style;
	return {
		...base(id, name, box),
		type: "text",
		content,
		fontId: "avant-garde",
		weight: 400,
		italic: false,
		sizePt: fs(sizePx),
		color: INK,
		align: "center",
		vAlign: "middle",
		lineHeight: 1.2,
		letterSpacing: 0,
		uppercase: false,
		fit: "shrink",
		minSizePt: Math.min(8, fs(sizePx)),
		...rest,
	};
};

const rect = (
	id: string,
	name: string,
	box: Box,
	paint: Partial<
		Pick<ShapeElement, "fill" | "stroke" | "strokeWidth" | "cornerRadius">
	>,
): ShapeElement => ({
	...base(id, name, box),
	type: "shape",
	kind: "rect",
	fill: null,
	stroke: null,
	strokeWidth: 0,
	cornerRadius: 0,
	...paint,
});

const line = (
	id: string,
	name: string,
	[x, y, w]: [number, number, number],
	color: string,
	widthPx = 1,
): ShapeElement => ({
	...base(id, name, [x, y - 2, w, 4]),
	type: "shape",
	kind: "line",
	fill: null,
	stroke: color,
	strokeWidth: round(widthPx * 0.75),
	cornerRadius: 0,
});

const whiteLogo = (box: Box): ImageElement => ({
	...base("logo", "Logo", box),
	type: "image",
	src: { kind: "logo", logoId: "ayto-blanco" },
	fit: "contain",
});

const folio = (box: Box, align: FolioElement["align"]): FolioElement => ({
	...base("folio", "Folio", box),
	type: "folio",
	label: "",
	fontId: "avant-garde",
	weight: 600,
	italic: false,
	sizePt: fs(13),
	color: INK,
	align,
	letterSpacing: 0,
	uppercase: false,
});

const qr = (x: number, y: number): DesignElement => {
	const side = px(80);
	return {
		...base("qr", "QR de verificación", [x, y, 80, 80]),
		w: side,
		h: side,
		type: "qr",
		color: NAME,
	};
};

const label = (
	id: string,
	name: string,
	box: Box,
	content: string,
	align: TextElement["align"] = "center",
) =>
	text(id, name, box, content, {
		sizePx: 11,
		color: MUTED,
		uppercase: true,
		letterSpacing: 0.08,
		align,
	});

/** Lo que una plantilla necesita para armarse: el acento y los textos del v1. */
export interface PresetInput {
	accent: string;
	subtitle: string;
	/** Vacía: se imprime la descripción del curso (`{descripcion}`). */
	description: string;
	signatories: readonly [CertificateSignatory, CertificateSignatory];
	folioFormat: string;
}

interface FooterLayout {
	/** Columnas de firma 1, firma 2, fecha y folio, en px del v1. */
	columns: [number, number, number, number];
	width: number;
	/** Alto de la línea de firma. */
	lineY: number;
	/** Arriba de los metadatos (fecha y folio). */
	metaY: number;
	qr: [number, number];
	accent: string;
}

const signatoryBlock = (
	index: 1 | 2,
	signatory: CertificateSignatory,
	x: number,
	{ width, lineY, accent }: FooterLayout,
): DesignElement[] => {
	if (!signatory.enabled) return [];
	const id = `firma-${index}`;
	const elements: DesignElement[] = [];
	if (signatory.signatureUrl) {
		elements.push({
			...base(`${id}-imagen`, `Firma ${index}`, [x, lineY - 50, width, 48]),
			type: "image",
			src: { kind: "asset", ref: signatory.signatureUrl, role: "signature" },
			fit: "contain",
		});
	}
	elements.push(
		line(`${id}-linea`, `Línea de firma ${index}`, [x, lineY, width], accent),
		text(
			`${id}-nombre`,
			`Nombre del firmante ${index}`,
			[x, lineY + 8, width, 17],
			literalText(signatory.name),
			{
				sizePx: 13,
				weight: 600,
			},
		),
		label(
			`${id}-cargo`,
			`Cargo del firmante ${index}`,
			[x, lineY + 26, width, 28],
			literalText(signatory.role),
		),
	);
	return elements;
};

const footer = (input: PresetInput, layout: FooterLayout): DesignElement[] => {
	const [one, two, date, number] = layout.columns;
	const { width, metaY } = layout;
	return [
		...signatoryBlock(1, input.signatories[0], one, layout),
		...signatoryBlock(2, input.signatories[1], two, layout),
		label(
			"fecha-etiqueta",
			"Etiqueta de fecha",
			[date, metaY, width, 14],
			"Fecha de emisión",
		),
		text(
			"fecha",
			"Fecha de emisión",
			[date, metaY + 17, width, 32],
			"{fecha}",
			{
				sizePx: 13,
				weight: 600,
				vAlign: "top",
			},
		),
		label(
			"folio-etiqueta",
			"Etiqueta de folio",
			[number, metaY, width, 14],
			"Folio",
		),
		folio([number, metaY + 17, width, 18], "center"),
		qr(...layout.qr),
	];
};

const subtitleOf = (
	input: PresetInput,
	box: Box,
	style: TextStyle & { sizePx: number },
) =>
	input.subtitle.trim()
		? [
				text(
					"subtitulo",
					"Subtítulo",
					box,
					literalText(input.subtitle.trim()),
					style,
				),
			]
		: [];

const descriptionContent = (input: PresetInput) =>
	literalText(input.description.trim()) || "{descripcion}";

const page = (): CertificateDesignV2["page"] => ({
	preset: "A4",
	orientation: "landscape",
	widthPt,
	heightPt,
});

const institucional = (input: PresetInput): DesignElement[] => {
	const accent = input.accent;
	return [
		rect("franja", "Franja", [0, 0, 1100, 136], { fill: accent }),
		whiteLogo([72, 28, 245, 80]),
		text("dependencia", "Dependencia", [508, 30, 520, 42], "{dependencia}", {
			sizePx: 16,
			weight: 600,
			color: WHITE,
			align: "right",
			vAlign: "bottom",
			lineHeight: 1.3,
		}),
		text(
			"emisor",
			"Emisor",
			[508, 74, 520, 16],
			"Instituto Digital de Capacitación",
			{
				sizePx: 11,
				color: WHITE,
				align: "right",
				uppercase: true,
				letterSpacing: 0.14,
				opacity: 0.85,
			},
		),
		text("titulo", "Título", [110, 222, 880, 22], "Constancia", {
			sizePx: 13,
			weight: 600,
			color: accent,
			uppercase: true,
			letterSpacing: 0.4,
		}),
		...subtitleOf(input, [110, 250, 880, 20], { sizePx: 14, color: MUTED }),
		text(
			"otorga",
			"Otorga",
			[110, 286, 880, 20],
			"Otorga la presente constancia a",
			{
				sizePx: 14,
				color: MUTED,
			},
		),
		text(
			"participante",
			"Participante",
			[110, 306, 880, 72],
			"{participante}",
			{
				sizePx: 56,
				fontId: "eb-garamond",
				color: NAME,
				minSizePt: 20,
			},
		),
		line("subrayado", "Subrayado del nombre", [300, 382, 500], accent, 2),
		text(
			"acredita",
			"Acredita",
			[110, 396, 880, 20],
			"por haber acreditado la capacitación",
			{
				sizePx: 14,
				color: MUTED,
			},
		),
		text(
			"capacitacion",
			"Capacitación",
			[110, 418, 880, 46],
			"{capacitacion}",
			{
				sizePx: 30,
				fontId: "eb-garamond",
				italic: true,
				color: accent,
				lineHeight: 1.15,
				minSizePt: 12,
			},
		),
		text(
			"duracion",
			"Duración",
			[110, 466, 880, 20],
			"Con una duración de {horas}",
			{
				sizePx: 14,
				weight: 600,
			},
		),
		text(
			"descripcion",
			"Descripción",
			[170, 492, 760, 62],
			descriptionContent(input),
			{
				sizePx: 13,
				color: BODY,
				lineHeight: 1.45,
				vAlign: "top",
			},
		),
		...footer(input, {
			columns: [90, 328, 566, 804],
			width: 206,
			lineY: 691,
			metaY: 699,
			qr: [867, 610],
			accent,
		}),
	];
};

const minima = (input: PresetInput): DesignElement[] => {
	const accent = input.accent;
	return [
		rect("columna", "Columna", [0, 0, 230, 780], { fill: accent }),
		whiteLogo([32, 56, 166, 54]),
		text("dependencia", "Dependencia", [32, 610, 166, 82], "{dependencia}", {
			sizePx: 15,
			weight: 600,
			color: WHITE,
			align: "left",
			vAlign: "bottom",
			lineHeight: 1.3,
		}),
		text(
			"emisor",
			"Emisor",
			[32, 700, 166, 28],
			"Instituto Digital de Capacitación",
			{
				sizePx: 10,
				color: WHITE,
				align: "left",
				vAlign: "top",
				uppercase: true,
				letterSpacing: 0.14,
				opacity: 0.85,
			},
		),
		text("titulo", "Título", [306, 62, 718, 18], "Constancia", {
			sizePx: 12,
			weight: 600,
			color: accent,
			align: "left",
			uppercase: true,
			letterSpacing: 0.4,
		}),
		...subtitleOf(input, [306, 94, 718, 20], {
			sizePx: 14,
			color: MUTED,
			align: "left",
		}),
		text(
			"otorga",
			"Otorga",
			[306, 128, 718, 18],
			"Otorga la presente constancia a",
			{
				sizePx: 13,
				color: MUTED,
				align: "left",
			},
		),
		text(
			"participante",
			"Participante",
			[306, 148, 718, 72],
			"{participante}",
			{
				sizePx: 64,
				fontId: "eb-garamond",
				color: NAME,
				align: "left",
				minSizePt: 20,
			},
		),
		text(
			"acredita",
			"Acredita",
			[306, 222, 718, 18],
			"por haber acreditado la capacitación",
			{
				sizePx: 13,
				color: MUTED,
				align: "left",
			},
		),
		text(
			"capacitacion",
			"Capacitación",
			[306, 244, 718, 48],
			"{capacitacion}",
			{
				sizePx: 32,
				fontId: "eb-garamond",
				italic: true,
				color: accent,
				align: "left",
				lineHeight: 1.15,
				minSizePt: 12,
			},
		),
		line("subrayado", "Filete", [306, 298, 718], accent, 2),
		text(
			"duracion",
			"Duración",
			[306, 311, 718, 20],
			"Con una duración de {horas}",
			{
				sizePx: 14,
				weight: 600,
				align: "left",
			},
		),
		text(
			"descripcion",
			"Descripción",
			[306, 338, 718, 62],
			descriptionContent(input),
			{
				sizePx: 13,
				color: BODY,
				align: "left",
				vAlign: "top",
				lineHeight: 1.55,
			},
		),
		...footer(input, {
			columns: [306, 494, 681, 869],
			width: 156,
			lineY: 676,
			metaY: 684,
			qr: [906, 596],
			accent,
		}),
	];
};

const marco = (input: PresetInput): DesignElement[] => {
	const accent = input.accent;
	const ring = shade(accent, 0.35);
	return [
		rect("borde", "Borde", [0, 0, 1100, 780], {
			fill: shade(accent, 0.94),
			stroke: accent,
			strokeWidth: round(14 * 0.75 * 2),
		}),
		rect("marco", "Marco", [36, 36, 1028, 708], {
			fill: "#fffdf9",
			stroke: ring,
			strokeWidth: 1.5,
		}),
		rect("anillo", "Anillo del medallón", [423, 57, 254, 106], {
			stroke: ring,
			strokeWidth: 1.5,
			cornerRadius: py(53),
		}),
		rect("medallon", "Medallón", [430, 64, 240, 92], {
			fill: accent,
			cornerRadius: py(46),
		}),
		whiteLogo([462, 81, 176, 57]),
		text(
			"dependencia",
			"Dependencia",
			[118, 168, 864, 18],
			"{dependencia} · Instituto Digital de Capacitación",
			{
				sizePx: 11,
				color: MUTED,
				uppercase: true,
				letterSpacing: 0.14,
			},
		),
		text("titulo", "Título", [118, 262, 864, 42], "Constancia", {
			sizePx: 32,
			fontId: "eb-garamond",
			color: accent,
			uppercase: true,
			letterSpacing: 0.3,
		}),
		...subtitleOf(input, [118, 307, 864, 18], { sizePx: 13, color: MUTED }),
		text(
			"otorga",
			"Otorga",
			[118, 337, 864, 18],
			"Otorga la presente constancia a",
			{
				sizePx: 13,
				color: MUTED,
			},
		),
		text(
			"participante",
			"Participante",
			[118, 355, 864, 60],
			"{participante}",
			{
				sizePx: 52,
				fontId: "eb-garamond",
				italic: true,
				color: NAME,
				minSizePt: 20,
			},
		),
		text(
			"acredita",
			"Acredita",
			[118, 415, 864, 18],
			"por haber acreditado la capacitación",
			{
				sizePx: 13,
				color: MUTED,
			},
		),
		text(
			"capacitacion",
			"Capacitación",
			[118, 434, 864, 40],
			"{capacitacion}",
			{
				sizePx: 27,
				fontId: "eb-garamond",
				color: accent,
				lineHeight: 1.15,
				minSizePt: 12,
			},
		),
		text(
			"duracion",
			"Duración",
			[118, 476, 864, 18],
			"Con una duración de {horas}",
			{
				sizePx: 13,
				weight: 600,
			},
		),
		text(
			"descripcion",
			"Descripción",
			[190, 498, 720, 40],
			descriptionContent(input),
			{
				sizePx: 12,
				color: BODY,
				lineHeight: 1.5,
				vAlign: "top",
			},
		),
		...footer(input, {
			columns: [118, 342, 566, 790],
			width: 192,
			lineY: 667,
			metaY: 675,
			qr: [846, 586],
			accent,
		}),
	];
};

const BUILDERS: Record<
	CertificateTemplateId,
	(input: PresetInput) => DesignElement[]
> = {
	institucional,
	minima,
	marco,
};

/** Una plantilla de partida armada con un acento y unos textos. */
export const buildPreset = (
	templateId: CertificateTemplateId,
	input: PresetInput,
): CertificateDesignV2 => ({
	version: 2,
	page: page(),
	background: { kind: "color", color: WHITE },
	elements: BUILDERS[templateId]({
		...input,
		accent: safeColor(input.accent, CERTIFICATE_ACCENTS[0]),
	}),
	folioFormat: input.folioFormat,
});

export const PRESET_LABELS: Record<CertificateTemplateId, string> = {
	institucional: "Institucional",
	minima: "Mínima",
	marco: "Marco",
};

const DEFAULT_INPUT: PresetInput = {
	accent: CERTIFICATE_ACCENTS[0],
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

export const PRESETS: Record<CertificateTemplateId, CertificateDesignV2> = {
	institucional: buildPreset("institucional", DEFAULT_INPUT),
	minima: buildPreset("minima", DEFAULT_INPUT),
	marco: buildPreset("marco", DEFAULT_INPUT),
};

/**
 * El diseño con el que emite un curso que nunca publicó, y del que parte el
 * editor. Los snapshots emitidos guardan el suyo completo: cambiar este no los
 * toca.
 */
export const DEFAULT_CERTIFICATE_DESIGN: CertificateDesignV2 =
	PRESETS.institucional;

/**
 * El v1 llevado al editor libre: su plantilla, armada con su acento, sus
 * textos y sus firmas. Es aproximado —el v1 maquetaba en flujo— y por eso el
 * editor avisa que hay que revisarlo antes de publicar.
 */
export const migrateV1ToV2 = (
	design: CertificateDesignV1,
): CertificateDesignV2 =>
	buildPreset(design.templateId, {
		accent: design.accentColor,
		subtitle: design.subtitle,
		description: design.description,
		signatories: design.signatories,
		folioFormat: design.folioFormat,
	});

/** El diseño que abre el editor: el v2 tal cual, o el v1 convertido. */
export const toEditableDesign = (
	design: CertificateDesignV1 | CertificateDesignV2,
): CertificateDesignV2 =>
	"version" in design ? design : migrateV1ToV2(design);

/** Lado del QR de un documento en blanco: poco más de 2 cm. */
const BLANK_QR_PT = 64;
const BLANK_MARGIN_PT = 36;

/**
 * Un certificado en blanco, del tamaño pedido: solo lo obligatorio, el QR de
 * verificación y el folio, abajo a la derecha.
 */
export const blankDesign = (
	page: CertificateDesignV2["page"],
	folioFormat = DEFAULT_INPUT.folioFormat,
): CertificateDesignV2 => {
	const qrX = round(page.widthPt - BLANK_MARGIN_PT - BLANK_QR_PT);
	const qrY = round(page.heightPt - BLANK_MARGIN_PT - BLANK_QR_PT - 18);
	const common = { rotation: 0, opacity: 1, locked: false, hidden: false };
	return {
		version: 2,
		page,
		background: { kind: "color", color: WHITE },
		elements: [
			{
				...common,
				id: "qr",
				name: "QR de verificación",
				type: "qr",
				x: qrX,
				y: qrY,
				w: BLANK_QR_PT,
				h: BLANK_QR_PT,
				color: NAME,
			},
			{
				...common,
				id: "folio",
				name: "Folio",
				type: "folio",
				x: round(qrX + BLANK_QR_PT / 2 - 60),
				y: round(qrY + BLANK_QR_PT + 4),
				w: 120,
				h: 14,
				label: "Folio: ",
				fontId: "avant-garde",
				weight: 400,
				italic: false,
				sizePt: 8,
				color: INK,
				align: "center",
				letterSpacing: 0,
				uppercase: false,
			},
		],
		folioFormat,
	};
};
