import { describe, expect, test } from "vitest";
import { isHttpUrl } from "../url.rules";

describe("isHttpUrl", () => {
	test.each([
		["https://meet.google.com/abc-defg-hij", true],
		["http://intranet.gob.mx/sala", true],
		["javascript:alert(1)", false],
		["data:text/html,<script>alert(1)</script>", false],
		["ftp://archivos.gob.mx", false],
		["meet.google.com/abc", false],
		["", false],
	])("%s → %s", (value, expected) => {
		expect(isHttpUrl(value)).toBe(expected);
	});
});
