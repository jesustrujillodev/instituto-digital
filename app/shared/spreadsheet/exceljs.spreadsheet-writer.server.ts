import ExcelJS from "exceljs";
import { zonedWallClockOf } from "@/lib/date-utils";
import type {
	ISpreadsheetWriter,
	SpreadsheetCell,
	SpreadsheetFormat,
} from "./spreadsheet.port";

const NUMBER_FORMATS: Record<SpreadsheetFormat, string | undefined> = {
	text: undefined,
	integer: "0",
	decimal: "0.0",
	date: "dd/mm/yyyy",
	datetime: "dd/mm/yyyy hh:mm",
	time: "hh:mm",
};

const toCellValue = (cell: SpreadsheetCell) =>
	cell instanceof Date ? zonedWallClockOf(cell) : cell;

export const createExcelSpreadsheetWriter = (): ISpreadsheetWriter => ({
	async toXlsx(sheets) {
		const workbook = new ExcelJS.Workbook();

		for (const sheet of sheets) {
			const worksheet = workbook.addWorksheet(sheet.name, {
				views: [{ state: "frozen", ySplit: 1 }],
			});

			worksheet.columns = sheet.columns.map((column) => {
				const numFmt = NUMBER_FORMATS[column.format ?? "text"];
				return {
					header: column.header,
					width: column.width,
					...(numFmt && { style: { numFmt } }),
				};
			});
			worksheet.getRow(1).font = { bold: true };

			for (const row of sheet.rows) {
				worksheet.addRow(row.map(toCellValue));
			}

			if (sheet.rows.length > 0) {
				worksheet.autoFilter = {
					from: { row: 1, column: 1 },
					to: { row: 1, column: sheet.columns.length },
				};
			}
		}

		return new Uint8Array(await workbook.xlsx.writeBuffer());
	},
});
