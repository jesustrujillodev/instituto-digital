import { describe, expect, test } from "vitest";
import { createPasswordService } from "../password.service.server";

// Deliberadamente cortos: bcrypt a coste 12 tarda ~250 ms por operación, así que
// cada assert de más es un cuarto de segundo en cada push. Se cubre el contrato,
// no el algoritmo (que es de bcryptjs y ya tiene sus propias pruebas).
//
// El timeout va explícito y no en los 5 s por defecto: bcryptjs es JavaScript
// puro —no un binding nativo— y bajo la instrumentación de cobertura cada hash
// se multiplica lo suficiente para rozar ese límite. Sin esto la suite pasa sin
// cobertura y falla con ella, que es la peor clase de intermitencia.
const BCRYPT_TIMEOUT_MS = 30_000;

describe("createPasswordService", () => {
	test(
		"compare accepts the password that produced the hash and rejects any other",
		async () => {
			const service = createPasswordService();

			const hashed = await service.hash("contrasena1");

			expect(await service.compare("contrasena1", hashed)).toBe(true);
			expect(await service.compare("otra-cosa1", hashed)).toBe(false);
		},
		BCRYPT_TIMEOUT_MS,
	);

	// Salt por hash: dos cuentas con la misma contraseña no comparten hash, así
	// que un volcado de la tabla no revela qué usuarios la repiten ni permite
	// atacarlas en bloque con una rainbow table.
	test(
		"hashing the same password twice yields different hashes",
		async () => {
			const service = createPasswordService();

			const first = await service.hash("contrasena1");
			const second = await service.hash("contrasena1");

			expect(second).not.toBe(first);
			expect(first).not.toContain("contrasena1");
			expect(await service.compare("contrasena1", second)).toBe(true);
		},
		BCRYPT_TIMEOUT_MS,
	);
});
