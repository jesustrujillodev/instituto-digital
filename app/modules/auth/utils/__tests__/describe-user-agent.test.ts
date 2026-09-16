import { describe, expect, test } from "vitest";
import { describeUserAgent } from "../describe-user-agent";

// UA reales: cada navegador se hace pasar por los anteriores, que es justo lo
// que el orden de la detección tiene que desenredar.
const USER_AGENTS = {
	chromeWindows:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
	edgeWindows:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42",
	safariIphone:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
	chromeIphone:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
	safariMac:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
	firefoxLinux:
		"Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
	chromeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.127 Mobile Safari/537.36",
	operaWindows:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0",
};

describe("describeUserAgent", () => {
	test.each([
		[USER_AGENTS.chromeWindows, "Chrome en Windows"],
		[USER_AGENTS.edgeWindows, "Edge en Windows"],
		[USER_AGENTS.operaWindows, "Opera en Windows"],
		[USER_AGENTS.safariIphone, "Safari en iPhone"],
		[USER_AGENTS.chromeIphone, "Chrome en iPhone"],
		[USER_AGENTS.safariMac, "Safari en macOS"],
		[USER_AGENTS.firefoxLinux, "Firefox en Linux"],
		[USER_AGENTS.chromeAndroid, "Chrome en Android"],
	])("names browser and system: %s", (userAgent, expected) => {
		expect(describeUserAgent(userAgent)).toBe(expected);
	});

	test("returns only the part it recognizes", () => {
		expect(describeUserAgent("curl/8.4.0 (Windows)")).toBe("Windows");
	});

	test("falls back when there is nothing to recognize", () => {
		expect(describeUserAgent(null)).toBe("Desconocido");
		expect(describeUserAgent("")).toBe("Desconocido");
		expect(describeUserAgent("curl/8.4.0")).toBe("Desconocido");
	});
});
