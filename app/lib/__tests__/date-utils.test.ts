import { describe, expect, test } from "vitest";
import {
	endOfZonedDay,
	formatSessionRange,
	INSTITUTE_TIME_ZONE,
	startOfZonedDay,
	utcToZonedInput,
	zonedDayLabelOf,
	zonedInputToUtc,
	zonedYearOf,
} from "../date-utils";

describe("INSTITUTE_TIME_ZONE", () => {
	test("es la única zona de la plataforma", () => {
		expect(INSTITUTE_TIME_ZONE).toBe("America/Tijuana");
	});
});

describe("zonedInputToUtc", () => {
	// Tijuana sigue el horario de verano de la frontera: UTC-7 en verano y
	// UTC-8 en invierno. Si estas dos pruebas dieran el mismo desfase, el helper
	// estaría ignorando el cambio y las sesiones de noviembre saldrían corridas.
	test("en verano guarda con desfase de 7 horas", () => {
		expect(zonedInputToUtc("2026-07-15", "09:00").toISOString()).toBe(
			"2026-07-15T16:00:00.000Z",
		);
	});

	test("en invierno guarda con desfase de 8 horas", () => {
		expect(zonedInputToUtc("2026-11-20", "09:00").toISOString()).toBe(
			"2026-11-20T17:00:00.000Z",
		);
	});

	test("resuelve una hora del día del cambio de horario", () => {
		// El primer domingo de noviembre de 2026 los relojes se atrasan a las 02:00.
		// Las 09:00 de ese día ya están en horario de invierno.
		expect(zonedInputToUtc("2026-11-01", "09:00").toISOString()).toBe(
			"2026-11-01T17:00:00.000Z",
		);
	});

	test("rechaza una fecha u hora con formato ajeno al input", () => {
		expect(() => zonedInputToUtc("15/07/2026", "09:00")).toThrow(RangeError);
		expect(() => zonedInputToUtc("2026-07-15", "9:00")).toThrow(RangeError);
		expect(() => zonedInputToUtc("2026-07-15", "24:00")).toThrow(RangeError);
	});
});

describe("utcToZonedInput", () => {
	test.each([
		["2026-07-15", "09:00"],
		["2026-11-20", "09:00"],
		["2026-01-01", "00:00"],
		["2026-12-31", "23:59"],
	])("ida y vuelta conserva %s %s", (date, time) => {
		expect(utcToZonedInput(zonedInputToUtc(date, time))).toEqual({
			date,
			time,
		});
	});
});

describe("endOfZonedDay", () => {
	test("la fecha límite cubre el día completo", () => {
		expect(utcToZonedInput(endOfZonedDay("2026-10-12"))).toEqual({
			date: "2026-10-12",
			time: "23:59",
		});
	});
});

describe("startOfZonedDay", () => {
	test("una sesión nocturna pertenece a su día local, no al día UTC", () => {
		// 20:00 en Tijuana es ya el día siguiente en UTC.
		const session = zonedInputToUtc("2026-07-15", "20:00");

		expect(startOfZonedDay(session)).toEqual(
			zonedInputToUtc("2026-07-15", "00:00"),
		);
	});

	test("acierta el desfase de invierno", () => {
		const session = zonedInputToUtc("2026-11-20", "09:00");

		expect(startOfZonedDay(session).toISOString()).toBe(
			"2026-11-20T08:00:00.000Z",
		);
	});
});

describe("zonedYearOf", () => {
	test("la noche del 31 de diciembre cuenta para ese año aunque en UTC ya sea enero", () => {
		expect(zonedYearOf(zonedInputToUtc("2026-12-31", "20:00"))).toBe(2026);
	});
});

describe("formatSessionRange", () => {
	test("muestra la hora capturada, no la del servidor", () => {
		const startsAt = zonedInputToUtc("2026-10-05", "09:00");
		const endsAt = zonedInputToUtc("2026-10-05", "13:00");

		expect(formatSessionRange(startsAt, endsAt)).toContain("09:00–13:00");
	});

	test("si cruza la medianoche repite la fecha del cierre", () => {
		const startsAt = zonedInputToUtc("2026-10-05", "23:45");
		const endsAt = zonedInputToUtc("2026-10-06", "00:15");
		const range = formatSessionRange(startsAt, endsAt);

		expect(range).toContain("23:45");
		expect(range).toContain("00:15");
		expect(range).toContain("6 oct 2026");
	});
});

describe("zonedDayLabelOf", () => {
	// 23:30 en Tijuana ya es el día siguiente en UTC: el bloque debe decir el 5.
	test("lee el día de Tijuana, sin puntos de abreviatura", () => {
		const label = zonedDayLabelOf(zonedInputToUtc("2026-10-05", "23:30"));

		expect(label.day).toBe("5");
		expect(label.month).toBe("oct");
		expect(label.weekday).not.toContain(".");
	});
});
