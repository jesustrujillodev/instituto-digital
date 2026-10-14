import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Integración contra servicios reales (docs/testing/01-integracion-y-e2e.md):
 * la infraestructura de compose.test.yml, levantada por `bun run test:integration`.
 * Nada de aquí entra en `bun run test` ni en los hooks.
 */
export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		environment: "node",
		include: [
			"app/**/__tests__/**/*.int.test.ts",
			// Llevan un bloque contra Redis real que solo corre con REDIS_TEST_URL.
			"app/shared/queue/__tests__/queue.client.server.test.ts",
			"app/shared/rate-limit/__tests__/rate-limiter.redis.server.test.ts",
		],
		globals: false,
		setupFiles: ["app/shared/rules/messages.rules.ts"],
		globalSetup: ["vitest.integration.setup.ts"],
		// Una sola base, un solo Redis y un solo bucket: los archivos van en fila
		// para que una prueba que reclama "lo vencido" no tome filas de otra.
		fileParallelism: false,
		testTimeout: 20_000,
		hookTimeout: 60_000,
		env: {
			NODE_ENV: "test",
			// Que el .env del desarrollador no aporte nada: apunta a Neon y a su
			// SMTP, y una variable que se colara cambiaría lo que se prueba.
			DOTENV_CONFIG_PATH: ".env.integration-no-existe",
			DOTENV_CONFIG_QUIET: "true",
			DATABASE_URL:
				"postgresql://postgres:password@127.0.0.1:55432/idc_integration",
			JWT_SECRET: "test-jwt-secret-de-al-menos-32-caracteres",
			COOKIE_SECRET: "test-cookie-secret-de-al-menos-32-chars",
			REDIS_TEST_URL: "redis://127.0.0.1:56379",
			STORAGE_PROVIDER: "s3",
			STORAGE_ENDPOINT: "http://127.0.0.1:59000",
			STORAGE_FORCE_PATH_STYLE: "true",
			STORAGE_REGION: "us-east-1",
			STORAGE_ACCESS_KEY_ID: "minioadmin",
			STORAGE_SECRET_ACCESS_KEY: "minioadmin",
			STORAGE_BUCKET_NAME: "integration-storage",
			STORAGE_PUBLIC_BUCKET_NAME: "integration-public",
			SMTP_HOST: "127.0.0.1",
			SMTP_PORT: "51025",
			MAIL_FROM: "Instituto Digital <no-responder@idc.test>",
			APP_BASE_URL: "http://127.0.0.1:5173",
			MAILPIT_API_URL: "http://127.0.0.1:58025",
			PRISMA_HIDE_UPDATE_MESSAGE: "true",
		},
	},
});
