import { describe, expect, test } from "vitest";
import { formatBytes, pluralize } from "../cloud-format";

describe("formatBytes", () => {
	test.each([
		[0, "0 B"],
		[312, "312 B"],
		[1536, "1.5 KB"],
		[8 * 1024 * 1024, "8.0 MB"],
		[150 * 1024 * 1024, "150 MB"],
		[2 * 1024 ** 3, "2.0 GB"],
	])("%d → %s", (bytes, expected) => {
		expect(formatBytes(bytes)).toBe(expected);
	});
});

describe("pluralize", () => {
	test("elige la forma por la cantidad", () => {
		expect(pluralize(1, "archivo", "archivos")).toBe("1 archivo");
		expect(pluralize(1200, "archivo", "archivos")).toBe("1,200 archivos");
	});
});
