// El orden importa: Edge y Opera también anuncian "Chrome", y Chrome anuncia
// "Safari". Gana la primera coincidencia.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
	[/Edg(e|A|iOS)?\//, "Edge"],
	[/OPR\/|Opera/, "Opera"],
	[/SamsungBrowser\//, "Samsung Internet"],
	[/Firefox\/|FxiOS\//, "Firefox"],
	[/Chrome\/|CriOS\//, "Chrome"],
	[/Safari\//, "Safari"],
];

// iPhone y iPad antes que "Mac OS X", que aparece en los UA de iOS; Android
// antes que Linux por lo mismo.
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
	[/iPhone/, "iPhone"],
	[/iPad/, "iPad"],
	[/Android/, "Android"],
	[/Windows/, "Windows"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/CrOS/, "ChromeOS"],
	[/Linux/, "Linux"],
];

const firstMatch = (
	value: string,
	patterns: ReadonlyArray<readonly [RegExp, string]>,
) => patterns.find(([pattern]) => pattern.test(value))?.[1];

/**
 * "Chrome en Windows" a partir del user-agent crudo. Es una etiqueta para que
 * una persona reconozca el dispositivo en la tabla, no una detección fiable: el
 * UA completo sigue disponible donde se muestra.
 */
export function describeUserAgent(userAgent: string | null): string {
	if (!userAgent) return "Desconocido";

	const browser = firstMatch(userAgent, BROWSERS);
	const system = firstMatch(userAgent, SYSTEMS);

	if (browser && system) return `${browser} en ${system}`;
	return browser ?? system ?? "Desconocido";
}
