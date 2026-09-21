import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { createExcelSpreadsheetWriter } from "../exceljs.spreadsheet-writer.server";

const readBack = async (file: Uint8Array<ArrayBuffer>) => {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(file.buffer);
	return workbook;
};

describe("createExcelSpreadsheetWriter", () => {
	test("escribe cada hoja con su encabezado y sus filas", async () => {
		const file = await createExcelSpreadsheetWriter().toXlsx([
			{
				name: "Cursos",
				columns: [
					{ header: "Curso", width: 30 },
					{ header: "Horas", width: 8, format: "decimal" },
				],
				rows: [
					["Ética pública", 4.5],
					["Protección civil", null],
				],
			},
			{ name: "Sesiones", columns: [{ header: "Curso", width: 30 }], rows: [] },
		]);

		const workbook = await readBack(file);
		const cursos = workbook.getWorksheet("Cursos");

		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			"Cursos",
			"Sesiones",
		]);
		expect(cursos?.getRow(1).values).toEqual([undefined, "Curso", "Horas"]);
		expect(cursos?.getRow(1).font?.bold).toBe(true);
		expect(cursos?.getCell("B2").value).toBe(4.5);
		expect(cursos?.getCell("B2").numFmt).toBe("0.0");
		expect(cursos?.getCell("B3").value).toBeNull();
	});

	test("las fechas salen con la hora de pared del instituto", async () => {
		// 23:00 UTC del 20 de octubre son las 16:00 en Tijuana (UTC-7).
		const file = await createExcelSpreadsheetWriter().toXlsx([
			{
				name: "Sesiones",
				columns: [{ header: "Inicio", width: 18, format: "datetime" }],
				rows: [[new Date("2026-10-20T23:00:00.000Z")]],
			},
		]);

		const cell = (await readBack(file)).getWorksheet("Sesiones")?.getCell("A2");

		expect(cell?.value).toEqual(new Date("2026-10-20T16:00:00.000Z"));
		expect(cell?.numFmt).toBe("dd/mm/yyyy hh:mm");
	});
});
