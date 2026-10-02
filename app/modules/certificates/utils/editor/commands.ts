import type {
	CertificateDesignV2,
	DesignElement,
} from "../../domain/design/design-v2.schema";
import { isMandatory } from "./elements";
import { roundPt } from "./geometry";

// Comandos sobre el documento: funciones puras de diseño a diseño. Ninguno
// muta: el historial compara por identidad para saber si hubo cambio.

/** Cuánto se corre una copia respecto a su original. */
export const DUPLICATE_OFFSET_PT = 12;

const withElements = (
	design: CertificateDesignV2,
	elements: DesignElement[],
): CertificateDesignV2 => ({ ...design, elements });

export const addElements = (
	design: CertificateDesignV2,
	added: readonly DesignElement[],
): CertificateDesignV2 =>
	added.length === 0
		? design
		: withElements(design, [...design.elements, ...added]);

export const updateElement = (
	design: CertificateDesignV2,
	id: string,
	patch: Partial<DesignElement>,
): CertificateDesignV2 =>
	withElements(
		design,
		design.elements.map((element) =>
			element.id === id ? ({ ...element, ...patch } as DesignElement) : element,
		),
	);

/** Reemplaza varios elementos a la vez, por id: lo que devuelve un gesto. */
export const replaceElements = (
	design: CertificateDesignV2,
	changed: readonly DesignElement[],
): CertificateDesignV2 => {
	if (changed.length === 0) return design;
	const byId = new Map(changed.map((element) => [element.id, element]));
	return withElements(
		design,
		design.elements.map((element) => byId.get(element.id) ?? element),
	);
};

/** Borra la selección, menos QR y folio, que el certificado siempre lleva. */
export const removeElements = (
	design: CertificateDesignV2,
	ids: readonly string[],
): CertificateDesignV2 => {
	const wanted = new Set(ids);
	const kept = design.elements.filter(
		(element) => !wanted.has(element.id) || isMandatory(element),
	);
	return kept.length === design.elements.length
		? design
		: withElements(design, kept);
};

/** Las copias de la selección, encima de todo; QR y folio no se duplican. */
export const duplicateElements = (
	design: CertificateDesignV2,
	ids: readonly string[],
	newId: () => string,
): { design: CertificateDesignV2; ids: string[] } => {
	const wanted = new Set(ids);
	const copies = design.elements
		.filter((element) => wanted.has(element.id) && !isMandatory(element))
		.map((element) => ({
			...element,
			id: newId(),
			name: `${element.name} (copia)`.slice(0, 60),
			x: roundPt(element.x + DUPLICATE_OFFSET_PT),
			y: roundPt(element.y + DUPLICATE_OFFSET_PT),
			locked: false,
		}));
	return {
		design: addElements(design, copies),
		ids: copies.map((copy) => copy.id),
	};
};

/** Mueve la selección; los bloqueados se quedan. */
export const moveElements = (
	design: CertificateDesignV2,
	ids: readonly string[],
	dx: number,
	dy: number,
): CertificateDesignV2 => {
	if (dx === 0 && dy === 0) return design;
	const wanted = new Set(ids);
	return withElements(
		design,
		design.elements.map((element) =>
			wanted.has(element.id) && !element.locked
				? { ...element, x: roundPt(element.x + dx), y: roundPt(element.y + dy) }
				: element,
		),
	);
};

export type Reorder = "forward" | "backward" | "front" | "back";

/** Cambia el orden de apilado de la selección, conservando su orden relativo. */
export const reorderElements = (
	design: CertificateDesignV2,
	ids: readonly string[],
	direction: Reorder,
): CertificateDesignV2 => {
	const wanted = new Set(ids);
	const elements = [...design.elements];
	const selected = elements.filter((element) => wanted.has(element.id));
	if (selected.length === 0) return design;

	if (direction === "front" || direction === "back") {
		const rest = elements.filter((element) => !wanted.has(element.id));
		return withElements(
			design,
			direction === "front" ? [...rest, ...selected] : [...selected, ...rest],
		);
	}

	const step = direction === "forward" ? 1 : -1;
	const indices = elements
		.map((element, index) => (wanted.has(element.id) ? index : -1))
		.filter((index) => index >= 0);
	const order = step === 1 ? [...indices].reverse() : indices;
	for (const index of order) {
		const target = index + step;
		if (
			target < 0 ||
			target >= elements.length ||
			wanted.has(elements[target].id)
		) {
			continue;
		}
		[elements[index], elements[target]] = [elements[target], elements[index]];
	}
	return withElements(design, elements);
};

/** Mueve una capa a una posición de la lista (arrastrar en el panel de capas). */
export const moveLayer = (
	design: CertificateDesignV2,
	id: string,
	toIndex: number,
): CertificateDesignV2 => {
	const from = design.elements.findIndex((element) => element.id === id);
	if (from < 0) return design;
	const target = Math.max(0, Math.min(design.elements.length - 1, toIndex));
	if (target === from) return design;
	const elements = [...design.elements];
	const [moved] = elements.splice(from, 1);
	elements.splice(target, 0, moved);
	return withElements(design, elements);
};

/** Las formas y los logos: la decoración que trae una plantilla. */
const isDecoration = (element: DesignElement) =>
	element.type === "shape" ||
	(element.type === "image" &&
		!(element.src.kind === "asset" && element.src.role === "signature"));

export const hasDecoration = (design: CertificateDesignV2): boolean =>
	design.elements.some(isDecoration);

/**
 * El diseño sin formas ni logos: lo que se quiere al poner un PDF que ya trae
 * su propio diseño. Quedan los textos, las firmas, el QR y el folio.
 */
export const withoutDecoration = (
	design: CertificateDesignV2,
): CertificateDesignV2 =>
	hasDecoration(design)
		? withElements(
				design,
				design.elements.filter((element) => !isDecoration(element)),
			)
		: design;
