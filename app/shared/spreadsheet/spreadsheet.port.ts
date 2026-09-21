/** Una `Date` es un instante: el adaptador la escribe en la zona del instituto. */
export type SpreadsheetCell = string | number | Date | null;

export type SpreadsheetFormat =
	| "text"
	| "integer"
	| "decimal"
	| "date"
	| "datetime"
	| "time";

export interface SpreadsheetColumn {
	header: string;
	/** En caracteres, como las mide Excel. */
	width: number;
	format?: SpreadsheetFormat;
}

export interface SpreadsheetSheet {
	/** Excel admite hasta 31 caracteres y rechaza `\ / ? * [ ] :`. */
	name: string;
	columns: readonly SpreadsheetColumn[];
	/** Cada fila trae una celda por columna, en el mismo orden. */
	rows: readonly (readonly SpreadsheetCell[])[];
}

export interface ISpreadsheetWriter {
	toXlsx(sheets: readonly SpreadsheetSheet[]): Promise<Uint8Array<ArrayBuffer>>;
}

export const XLSX_CONTENT_TYPE =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
