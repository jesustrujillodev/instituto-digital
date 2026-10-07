import * as v from "valibot";
import {
	ERROR_PREVIEW_LENGTH,
	OPERATIONS_PAGE_SIZES,
	OPERATIONS_TABS,
} from "./operations.config";
import type { OperationsPage } from "./operations.types";

export const operationsListRule = v.object({
	tab: v.picklist(OPERATIONS_TABS, "Elige correos o trabajos fallidos."),
	page: v.pipe(
		v.number("El número de página debe ser numérico."),
		v.integer("El número de página debe ser un entero."),
		v.minValue(1, "El número de página debe ser 1 o mayor."),
	),
	pageSize: v.picklist(
		OPERATIONS_PAGE_SIZES,
		"El tamaño de página no está entre los permitidos.",
	),
});

/** Una línea legible del error: sin saltos ni espacios repetidos, y recortada. */
export const previewError = (text: string | null): string => {
	if (!text) return "";

	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > ERROR_PREVIEW_LENGTH
		? `${flat.slice(0, ERROR_PREVIEW_LENGTH - 1)}…`
		: flat;
};

export const pageWindowOf = ({
	page,
	pageSize,
}: OperationsPage): { skip: number; take: number } => ({
	skip: (page - 1) * pageSize,
	take: pageSize,
});
