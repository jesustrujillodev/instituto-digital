import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/** El Postgres de compose.test.yml; cualquier otro destino aborta la corrida. */
const TEST_DATABASE = { hosts: ["127.0.0.1", "localhost"], port: "55432" };

/**
 * Antes de conectarse a nada: la base dev de Neon es compartida y su outbox
 * envía correo real. Después, el schema por `db push` (no hay
 * prisma/migrations) una vez por corrida. Sin `--force-reset`: la base vive en
 * tmpfs y nace vacía con cada `up`; cada prueba crea y borra sus propias filas.
 */
export default function setup(project: TestProject) {
	// `test.env` llega a los procesos de prueba, no a este.
	const testEnv = { ...process.env, ...project.config.env };
	const databaseUrl = testEnv.DATABASE_URL ?? "";
	const target = new URL(databaseUrl);
	if (
		!TEST_DATABASE.hosts.includes(target.hostname) ||
		target.port !== TEST_DATABASE.port
	) {
		throw new Error(
			`La integración solo corre contra el Postgres de compose.test.yml (127.0.0.1:${TEST_DATABASE.port}); DATABASE_URL apunta a ${target.host}.`,
		);
	}

	execFileSync(
		process.execPath,
		["node_modules/prisma/build/index.js", "db", "push"],
		{ stdio: "inherit", env: testEnv },
	);
}
