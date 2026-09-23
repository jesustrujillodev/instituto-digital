/**
 * Muestras del renderer de certificados, para revisarlas en el navegador sin
 * interfaz de por medio (docs/certificates/00-certificados.md §5).
 *
 * Escribe cada plantilla con cinco casos en `.cache/certificados/` y los sirve
 * en localhost junto con `public/`. Servirlos y no abrirlos como `file://` es a
 * propósito: el navegador bloquea las fuentes cargadas desde archivo, y la
 * muestra saldría con tipografías sustitutas que el PDF no tendrá.
 *
 * Uso:
 *   bun run certificates:samples
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { DEFAULT_CERTIFICATE_DESIGN } from "@/modules/certificates/domain/certificate.config";
import { renderCertificateDocument } from "@/modules/certificates/domain/certificate.renderer";
import { CERTIFICATE_TEMPLATE_IDS } from "@/modules/certificates/domain/certificate.rules";
import type {
	CertificateDesign,
	CertificateRenderData,
} from "@/modules/certificates/domain/certificate.types";

const PORT = 4400;
const OUT_DIR = join(process.cwd(), ".cache", "certificados");
const PUBLIC_DIR = join(process.cwd(), "public");

const baseData: CertificateRenderData = {
	recipientName: "Diana Ruiz Peña",
	courseTitle: "Seguridad en obra",
	courseDescription:
		"Prevención de riesgos, equipo de protección personal y señalización en la obra pública municipal.",
	dependencyName: "Secretaría de Obras Públicas",
	hours: "20 horas",
	issuedOn: "23 de septiembre de 2026",
	folio: "2026-0001",
};

const [first, second] = DEFAULT_CERTIFICATE_DESIGN.signatories;

const CASES: {
	name: string;
	design?: Partial<CertificateDesign>;
	data?: Partial<CertificateRenderData>;
}[] = [
	{
		name: "normal",
		design: { subtitle: "Programa anual de capacitación 2026" },
	},
	{
		name: "textos-largos",
		design: {
			subtitle:
				"Programa anual de capacitación y actualización profesional del personal del Ayuntamiento 2026",
			signatories: [
				{
					...first,
					name: "María Guadalupe Hernández de la Fuente Villaseñor",
					role: "Coordinadora de Capacitación y Desarrollo Organizacional",
				},
				{
					...second,
					name: "José Francisco Martínez Castañeda Ibarra",
					role: "Titular de la Secretaría de Desarrollo Social Municipal",
				},
			],
		},
		data: {
			recipientName:
				"María Fernanda Guadalupe Rodríguez de la Barrera Villalobos",
			courseTitle:
				"Actualización en el marco normativo municipal para la contratación, supervisión y finiquito de la obra pública y los servicios relacionados",
			courseDescription:
				"Curso integral que recorre la normativa federal, estatal y municipal aplicable a la obra pública, desde la planeación y programación hasta la contratación, la supervisión, la bitácora electrónica, las estimaciones, los convenios modificatorios y el finiquito, con casos prácticos de la administración municipal y ejercicios de revisión documental. Incluye además los criterios de auditoría más frecuentes.",
			dependencyName:
				"Secretaría de Desarrollo Territorial, Urbano y Ambiental del Municipio",
			folio: "SDTUA-2026-09-000123",
		},
	},
	{
		name: "una-palabra",
		data: {
			recipientName: "Ana",
			courseTitle: "Excel",
			courseDescription: "",
			dependencyName: "DIF",
			hours: "1 hora",
		},
	},
	{
		name: "sin-firmas",
		design: {
			signatories: [
				{ ...first, enabled: false },
				{ ...second, enabled: false },
			],
		},
		data: { hours: null },
	},
	{
		name: "nombre-malicioso",
		design: { subtitle: `"><img src=x onerror=alert(1)>` },
		data: { recipientName: `<script>alert("x")</script> O'Brien & Cía.` },
	},
];

await mkdir(OUT_DIR, { recursive: true });

const files: string[] = [];
for (const templateId of CERTIFICATE_TEMPLATE_IDS) {
	for (const sample of CASES) {
		const file = `${templateId}-${sample.name}.html`;
		const document = renderCertificateDocument(
			{ ...DEFAULT_CERTIFICATE_DESIGN, templateId, ...sample.design },
			{ ...baseData, ...sample.data },
			// Raíz del servidor: fuentes y logo se piden igual que dentro de la app.
			{ assetBaseUrl: "" },
		);
		await writeFile(join(OUT_DIR, file), document, "utf8");
		files.push(file);
	}
}

const index = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Muestras de certificados</title></head>
<body style="font-family:sans-serif;padding:24px"><h1>Muestras de certificados</h1><ul>
${files.map((file) => `<li><a href="/muestras/${file}">${file}</a></li>`).join("\n")}
</ul></body></html>`;

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".png": "image/png",
	".woff2": "font/woff2",
	".woff": "font/woff",
};

/** Solo sirve archivos dentro de su carpeta: nada de `../`. */
const resolveInside = (dir: string, relative: string): string | null => {
	const path = normalize(join(dir, relative));
	return path.startsWith(dir) ? path : null;
};

createServer(async (request, response) => {
	const path = decodeURIComponent(
		new URL(request.url ?? "/", "http://localhost").pathname,
	);

	if (path === "/") {
		response.writeHead(200, { "Content-Type": CONTENT_TYPES[".html"] });
		response.end(index);
		return;
	}

	const file = path.startsWith("/muestras/")
		? resolveInside(OUT_DIR, path.slice("/muestras/".length))
		: resolveInside(PUBLIC_DIR, path);

	try {
		if (!file) throw new Error("fuera de la carpeta");
		const content = await readFile(file);
		response.writeHead(200, {
			"Content-Type":
				CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
		});
		response.end(content);
	} catch {
		response.writeHead(404);
		response.end("No encontrado");
	}
}).listen(PORT);

console.log(`${files.length} muestras en ${OUT_DIR}`);
console.log(`Ábrelas en http://localhost:${PORT}/ (Ctrl+C para salir)`);
