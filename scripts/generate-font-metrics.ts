/**
 * Genera app/modules/certificates/domain/design/font-metrics.generated.ts con
 * los avances de cada cara del catálogo del editor de certificados.
 *
 * Uso: bun run certificates:font-metrics
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import {
	FONT_CATALOG,
	FONT_IDS,
	faceKeyOf,
} from "../app/modules/certificates/domain/design/font-catalog";
import { METRIC_RANGES } from "../app/modules/certificates/domain/design/font-metrics";

const OUT = path.resolve(
	"app/modules/certificates/domain/design/font-metrics.generated.ts",
);

const perMille = (value: number, unitsPerEm: number) =>
	Math.round((value / unitsPerEm) * 1000);

const lines: string[] = [];
for (const font of FONT_IDS) {
	for (const face of FONT_CATALOG[font].faces) {
		const bytes = readFileSync(path.resolve("public", face.file.slice(1)));
		const parsed = fontkit.create(bytes) as fontkit.Font;
		const widths: number[] = [];
		for (const [start, end] of METRIC_RANGES) {
			for (let codePoint = start; codePoint <= end; codePoint++) {
				widths.push(
					parsed.hasGlyphForCodePoint(codePoint)
						? perMille(
								parsed.glyphForCodePoint(codePoint).advanceWidth,
								parsed.unitsPerEm,
							)
						: 0,
				);
			}
		}
		const hash = createHash("sha256").update(bytes).digest("hex");
		lines.push(
			`\t"${faceKeyOf(font, face.weight, face.italic)}": { hash: "${hash}", ascent: ${perMille(parsed.ascent, parsed.unitsPerEm)}, descent: ${perMille(Math.abs(parsed.descent), parsed.unitsPerEm)}, widths: [${widths.join(",")}] },`,
		);
	}
}

writeFileSync(
	OUT,
	`// Generado por scripts/generate-font-metrics.ts. No se edita a mano.
import type { FaceMetrics } from "./font-metrics";

export const FONT_METRICS: Record<string, FaceMetrics> = {
${lines.join("\n")}
};
`,
);
console.log(`${lines.length} caras → ${path.relative(process.cwd(), OUT)}`);
