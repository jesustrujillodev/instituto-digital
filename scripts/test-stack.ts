// Levanta compose.test.yml, corre las pruebas y lo baja aunque fallen
// (docs/testing/01-integracion-y-e2e.md).
//
//   bun run test:integration [--keep] [-- <args de vitest>]
//   bun run test:e2e         [--keep] [-- <args de playwright>]
//
// `--keep` deja el entorno arriba para depurar; `docker compose -f
// compose.test.yml --profile app down -v` lo baja después. Con
// COMPOSE_TEST_OVERRIDE se suma otro archivo de compose (la caché de CI).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const COMPOSE = [
	"compose",
	"-f",
	"compose.test.yml",
	...(process.env.COMPOSE_TEST_OVERRIDE
		? ["-f", process.env.COMPOSE_TEST_OVERRIDE]
		: []),
];
const INFRA = ["postgres", "redis", "mailpit"];
const APP = ["--profile", "app"];

const [mode, ...rest] = process.argv.slice(2);
const separator = rest.indexOf("--");
const flags = separator === -1 ? rest : rest.slice(0, separator);
const passthrough = separator === -1 ? [] : rest.slice(separator + 1);
const keep = flags.includes("--keep");

const run = (command: string, args: string[]) =>
	spawnSync(command, args, { stdio: "inherit" }).status ?? 1;

const docker = (...args: string[]) => run("docker", [...COMPOSE, ...args]);

const capture = (...args: string[]) =>
	spawnSync("docker", [...COMPOSE, ...args], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	}).stdout ?? "";

const finish = (status: number, profiles: string[]) => {
	if (!keep) docker(...profiles, "down", "-v", "--remove-orphans");
	process.exit(status);
};

/**
 * Un deploy manda SIGTERM al worker: tiene que cerrar sus colas y salir con 0,
 * no morir a la mitad de un trabajo (app/worker.server.ts).
 */
const workerStopsCleanly = () => {
	docker(...APP, "stop", "--timeout", "30", "worker");
	const exitCode = spawnSync(
		"docker",
		[
			"inspect",
			"--format",
			"{{.State.ExitCode}}",
			capture(...APP, "ps", "-a", "-q", "worker").trim(),
		],
		{ encoding: "utf8" },
	).stdout.trim();
	const stopped = capture(...APP, "logs", "--no-color", "worker").includes(
		"worker stopping",
	);
	if (exitCode === "0" && stopped) return true;
	console.error(
		`El worker no se detuvo limpio con SIGTERM (código ${exitCode}, "worker stopping" ${stopped ? "sí" : "no"} aparece en el log).`,
	);
	return false;
};

const saveLogs = () => {
	mkdirSync("e2e/.results", { recursive: true });
	writeFileSync(
		"e2e/.results/compose.log",
		capture(...APP, "logs", "--no-color"),
	);
	console.error("Logs de los contenedores en e2e/.results/compose.log");
};

if (mode === "integration") {
	if (docker("up", "-d", "--wait", ...INFRA) !== 0) finish(1, []);
	finish(
		run(process.execPath, [
			"x",
			"vitest",
			"run",
			"-c",
			"vitest.integration.config.ts",
			...passthrough,
		]),
		[],
	);
} else if (mode === "e2e") {
	if (docker(...APP, "up", "-d", "--build", "--wait") !== 0) {
		saveLogs();
		finish(1, APP);
	}
	let status = docker(
		...APP,
		"--profile",
		"e2e",
		"run",
		"--rm",
		"playwright",
		...passthrough,
	);
	if (!workerStopsCleanly()) status ||= 1;
	if (status !== 0) saveLogs();
	finish(status, APP);
} else {
	console.error(
		"Uso: bun scripts/test-stack.ts <integration|e2e> [--keep] [-- args]",
	);
	process.exit(2);
}
