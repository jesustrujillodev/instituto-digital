/**
 * Prueba de carga del asistente de cursos: cada usuario virtual da de alta un
 * borrador y luego alterna abrir un paso y guardarlo, con una pausa de
 * "persona leyendo" entre cada cosa. Mide del lado del cliente, contra un
 * build de producción (`bun run build` + `react-router-serve`).
 *
 * Uso:
 *   bun scripts/load-test-wizard.ts --users=250 --think=15000 --duration=120
 *
 * Opciones (todas opcionales):
 *   --base=http://localhost:3000   servidor bajo prueba
 *   --users=100                    usuarios virtuales simultáneos
 *   --think=15000                  pausa media entre acciones (ms, ±50 %)
 *   --duration=120                 segundos de carga sostenida
 *   --email / --password           cuenta con alcance de cursos (seed por defecto)
 *   --warmup=30                    segundos iniciales que el reporte estable ignora
 *   --keep                         no borra los borradores creados
 *   --cleanup                      solo borra los `LOADTEST` de corridas previas
 *
 * Los cursos se crean con el título `LOADTEST <corrida>` y se borran al final
 * directamente en la base; un borrador sin sesiones ni inscritos no deja nada
 * colgado. El token de acceso dura 5 min: la corrida debe caber en ese tiempo.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "@/core/env.server";

const args = new Map(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"] as const;
	}),
);

const BASE = args.get("base") ?? "http://localhost:3000";
const USERS = Number(args.get("users") ?? 100);
const THINK_MS = Number(args.get("think") ?? 15_000);
const DURATION_MS = Number(args.get("duration") ?? 120) * 1000;
const EMAIL = args.get("email") ?? "laura.sop@instituto.gob.mx";
const PASSWORD = args.get("password") ?? "Password123!";
const WARMUP_MS = Number(args.get("warmup") ?? 30) * 1000;
const KEEP = args.has("keep");

const RUN_ID = Date.now().toString(36);
const TITLE_PREFIX = `LOADTEST ${RUN_ID}`;
// `--cleanup` solo borra lo que dejó una corrida interrumpida, sin cargar nada.
const CLEANUP_PREFIX = args.has("cleanup") ? "LOADTEST " : TITLE_PREFIX;
// Pasos que un borrador sin formato definido recorre con pantalla propia.
const STEPS = [1, 2, 4];

type Operation = "crear" | "abrir paso" | "guardar paso";
type Sample = { operation: Operation; at: number; ms: number; ok: boolean };

const samples: Sample[] = [];
const failures = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms: number) => ms * (0.5 + Math.random());

const payloadOf = (title: string) =>
	JSON.stringify({
		title,
		modality: "ONLINE",
		access: "PUBLIC",
		trainers: [],
		sessions: [],
	});

const login = async () => {
	const response = await fetch(`${BASE}/iniciar-sesion`, {
		method: "POST",
		redirect: "manual",
		headers: { Origin: BASE },
		body: new URLSearchParams({ email: EMAIL, password: PASSWORD }),
	});
	const cookies = response.headers
		.getSetCookie()
		.map((cookie) => cookie.split(";")[0]);
	if (response.status !== 302 || cookies.length === 0) {
		throw new Error(`login falló: ${response.status}`);
	}
	return cookies.join("; ");
};

const measure = async (
	operation: Operation,
	request: () => Promise<Response>,
): Promise<string | null> => {
	const started = performance.now();
	const at = started - runStarted;
	try {
		const response = await request();
		const body = await response.text();
		const ok =
			(response.status === 200 || response.status === 202) &&
			!body.includes('"success",false');
		samples.push({ operation, at, ms: performance.now() - started, ok });
		if (!ok) {
			const key = `${operation} · ${response.status}`;
			failures.set(key, (failures.get(key) ?? 0) + 1);
		}
		return ok ? body : null;
	} catch (error) {
		samples.push({
			operation,
			at,
			ms: performance.now() - started,
			ok: false,
		});
		const key = `${operation} · ${error instanceof Error ? error.message : error}`;
		failures.set(key, (failures.get(key) ?? 0) + 1);
		return null;
	}
};

const virtualUser = async (index: number, cookie: string, deadline: number) => {
	await sleep(Math.random() * THINK_MS);
	const headers = { Cookie: cookie, Origin: BASE };
	const title = `${TITLE_PREFIX} ${index}`;

	const form = new FormData();
	form.set("intent", "create");
	form.set("payload", payloadOf(title));
	const created = await measure("crear", () =>
		fetch(`${BASE}/dashboard/capacitaciones/nuevo.data`, {
			method: "POST",
			headers,
			body: form,
		}),
	);
	const documentId = created?.match(/"documentId","([0-9a-f-]{36})"/)?.[1];
	if (!documentId) return;

	let turn = 0;
	while (performance.now() < deadline) {
		const step = STEPS[turn % STEPS.length];
		turn += 1;
		const stepUrl = `${BASE}/dashboard/capacitaciones/${documentId}/nuevo/${step}.data`;

		await measure("abrir paso", () => fetch(stepUrl, { headers }));
		await sleep(jitter(THINK_MS));
		if (performance.now() >= deadline) break;

		const save = new FormData();
		save.set("intent", "update");
		save.set("leaving", "true");
		save.set("payload", payloadOf(`${title} v${turn}`));
		await measure("guardar paso", () =>
			fetch(stepUrl, { method: "POST", headers, body: save }),
		);
		await sleep(jitter(THINK_MS));
	}
};

const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ??
	0;

const report = (title: string, rows: Sample[], elapsedS: number) => {
	console.log(`\n${title} · ${elapsedS.toFixed(0)} s`);
	console.log(
		"operación      n     err   rps    p50    p95    p99    max (ms)",
	);
	for (const operation of ["crear", "abrir paso", "guardar paso"] as const) {
		const operationRows = rows.filter((row) => row.operation === operation);
		if (operationRows.length === 0) continue;
		const sorted = operationRows.map((row) => row.ms).sort((a, b) => a - b);
		const errors = operationRows.filter((row) => !row.ok).length;
		console.log(
			[
				operation.padEnd(13),
				String(operationRows.length).padStart(5),
				String(errors).padStart(6),
				(operationRows.length / elapsedS).toFixed(1).padStart(5),
				...[50, 95, 99, 100].map((p) =>
					percentile(sorted, p).toFixed(0).padStart(6),
				),
			].join(" "),
		);
	}
};

const cleanup = async () => {
	const prisma = new PrismaClient({
		adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
	});
	try {
		const { count } = await prisma.course.deleteMany({
			where: { title: { startsWith: CLEANUP_PREFIX }, status: "DRAFT" },
		});
		console.log(`\nborradores de prueba borrados: ${count}`);
	} finally {
		await prisma.$disconnect();
	}
};

if (args.has("cleanup")) {
	await cleanup();
	process.exit(0);
}

const cookie = await login();
const runStarted = performance.now();
const deadline = runStarted + DURATION_MS;
await Promise.all(
	Array.from({ length: USERS }, (_, index) =>
		virtualUser(index, cookie, deadline),
	),
);
const elapsedMs = performance.now() - runStarted;
const heading = `${USERS} usuarios · pausa ${THINK_MS} ms`;
report(`${heading} · corrida completa`, samples, elapsedMs / 1000);
report(
	`${heading} · estable (sin los primeros ${WARMUP_MS / 1000} s)`,
	samples.filter((sample) => sample.at >= WARMUP_MS),
	(elapsedMs - WARMUP_MS) / 1000,
);
for (const [key, count] of failures) console.log(`  fallo: ${key} ×${count}`);
if (!KEEP) await cleanup();
