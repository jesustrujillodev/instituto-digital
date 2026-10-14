import { defineConfig, devices } from "@playwright/test";
import { TOPOLOGIES } from "./support/topology";

/**
 * E2E contra la imagen del Dockerfile (docs/testing/01-integracion-y-e2e.md).
 * Corre dentro de la red de compose.test.yml (`bun run test:e2e`): los nombres
 * `*.idc.test` solo se resuelven ahí.
 */
export default defineConfig({
	testDir: "./specs",
	outputDir: "./.results",
	timeout: 60_000,
	expect: { timeout: 15_000 },
	// Las dos formas de despliegue comparten Mailpit y la base de cada una la
	// comparten sus specs: pocas a la vez, para que una espera no ahogue a otra.
	workers: 4,
	retries: process.env.CI ? 1 : 0,
	forbidOnly: Boolean(process.env.CI),
	reporter: [["list"], ["html", { outputFolder: "./.report", open: "never" }]],
	use: {
		...devices["Desktop Chrome"],
		// La CA interna de Caddy no está en el almacén del navegador.
		ignoreHTTPSErrors: true,
		locale: "es-MX",
		timezoneId: "America/Tijuana",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: TOPOLOGIES.flatMap((topology) => [
		{
			name: `${topology.name}-setup`,
			testDir: "./support",
			testMatch: /auth\.setup\.ts/,
			use: { baseURL: topology.baseURL },
			metadata: { topology: topology.name },
		},
		{
			name: topology.name,
			dependencies: [`${topology.name}-setup`],
			use: { baseURL: topology.baseURL },
			metadata: { topology: topology.name },
		},
	]),
});
