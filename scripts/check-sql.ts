// Fronteras del SQL escrito a mano (docs/reglas.md §8.2; AGENTS.md "SQL crudo").
// lint:arch solo ve imports, y el cliente de Prisma llega por el cradle sin
// importarse: estas reglas miran el texto. Se ejecuta con `bun run lint:sql` y
// en el pre-commit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "scripts", "prisma"];
const SKIPPED_DIRS = new Set([
	"node_modules",
	"build",
	".react-router",
	"__tests__",
	"migrations",
]);
const SELF = path.normalize("scripts/check-sql.ts");

/** El único sitio con SQL: los adaptadores server-only de infrastructure/. */
const SQL_HOME = /^app\/modules\/[^/]+\/infrastructure\/[^/]+\.server\.ts$/;
/** Capas de un módulo que no reciben el cliente del ORM. */
const NO_ORM_CLIENT =
	/^app\/modules\/[^/]+\/(application|domain|routes|components|hooks|utils)\//;

interface Rule {
	name: string;
	applies: (file: string) => boolean;
	pattern: RegExp;
	why: string;
}

const RULES: Rule[] = [
	{
		name: "sql-unsafe",
		applies: () => true,
		pattern: /\$(queryRaw|executeRaw)Unsafe\b|\bPrisma\.raw\s*\(/,
		why: "SQL sin parametrizar. Usa la plantilla etiquetada $queryRaw`...` con cada valor interpolado como parametro.",
	},
	{
		name: "sql-outside-infrastructure",
		applies: (file) => !SQL_HOME.test(file),
		pattern: /\$(queryRaw|executeRaw|queryRawTyped)\b/,
		why: "El SQL solo vive en app/modules/<modulo>/infrastructure/*.server.ts.",
	},
	{
		name: "sql-untyped-read",
		applies: (file) => SQL_HOME.test(file),
		pattern: /\$queryRaw(?![<A-Za-z])/,
		why: "Toda lectura declara el tipo de sus filas: $queryRaw<{ ... }[]>`...`.",
	},
	{
		name: "orm-client-outside-infrastructure",
		applies: (file) => NO_ORM_CLIENT.test(file),
		pattern: /ICradle\[\s*["']prisma["']\s*\]|\b(context|cradle)\.prisma\b/,
		why: "El cliente del ORM solo lo reciben los adaptadores de infrastructure/.",
	},
];

const isComment = (line: string) => {
	const trimmed = line.trimStart();
	return (
		trimmed.startsWith("//") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("/*")
	);
};

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			return SKIPPED_DIRS.has(entry) ? [] : sourceFiles(full);
		}
		return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry) ? [full] : [];
	});

const violations: string[] = [];

for (const file of ROOTS.flatMap(sourceFiles)) {
	if (path.normalize(file) === SELF) continue;
	const relative = file.split(path.sep).join("/");
	const lines = readFileSync(file, "utf8").split("\n");

	lines.forEach((line, index) => {
		if (isComment(line)) return;
		for (const rule of RULES) {
			if (rule.applies(relative) && rule.pattern.test(line)) {
				violations.push(
					`${relative}:${index + 1}  [${rule.name}] ${rule.why}\n    ${line.trim()}`,
				);
			}
		}
	});
}

if (violations.length > 0) {
	console.error(
		`✖ ${violations.length} violación(es) de SQL\n\n${violations.join("\n\n")}`,
	);
	process.exit(1);
}

console.log("✔ SQL solo en infrastructure/, parametrizado y tipado");
