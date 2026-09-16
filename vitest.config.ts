import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		environment: "node",
		// Solo se descubren tests dentro de __tests__/ (ver AGENTS.md, "Ubicacion
		// obligatoria de pruebas"). Un test co-localizado con su archivo no corre:
		// la convencion falla de forma visible en vez de depender de disciplina.
		include: ["app/**/__tests__/**/*.test.{ts,tsx}"],
		globals: false,
		// env.server valida y LANZA al importarse. Sin esto la suite dependeria del
		// .env del desarrollador y no correria en CI. Valores deterministas y
		// evidentemente falsos: los secretos solo tienen que pasar el minLength(32).
		env: {
			NODE_ENV: "test",
			DATABASE_URL: "postgresql://test:test@localhost:5432/test",
			JWT_SECRET: "test-jwt-secret-de-al-menos-32-caracteres",
			COOKIE_SECRET: "test-cookie-secret-de-al-menos-32-chars",
		},
		coverage: {
			provider: "v8",
			include: ["app/**/*.ts"],
			exclude: [
				"app/**/__tests__/**",
				"app/generated/**",
				// Solo tipos e interfaces: no hay codigo ejecutable que cubrir.
				"app/**/*.types.ts",
				"app/**/*.port.ts",
				// Manifiesto y declaracion de rutas: datos, no logica.
				"app/routes.ts",
				"app/**/routes.config.ts",
				// Hooks de React: capa de presentacion. Ejercitarlos exige jsdom y
				// Testing Library, que no estan en el proyecto (ver "Huecos conocidos"
				// en docs/testing/00-inventario-tests.md).
				"app/**/hooks/**",
				// Exigen integracion real (BD o SDK del proveedor), no unidad. Quedan
				// como hueco declarado en docs/testing/00-inventario-tests.md.
				"app/core/db.server.ts",
				"app/shared/di/container.server.ts",
				"app/shared/storage/s3.adapter.ts",
				"app/shared/storage/gcs.adapter.ts",
				"app/modules/*/infrastructure/*.repository.server.ts",
			],
			// Umbrales por DEBAJO de lo alcanzado hoy (98.5 / 95.7 / 98.9 / 99.1): el
			// margen absorbe una rama defensiva nueva sin bloquear un PR, pero un
			// archivo entero sin tests sí tumba `test:coverage`.
			//
			// Bajaron respecto al 99.7 / 98.8 / 100 / 99.9 anterior al quitar los
			// módulos de inventario y catálogo: eran ~100 archivos con cobertura casi
			// total y su peso tapaba los huecos que ya había en cloud/utils. Los huecos
			// son los mismos de antes: cambió el denominador, no la calidad.
			thresholds: {
				statements: 98,
				branches: 95,
				functions: 98,
				lines: 99,
			},
		},
	},
});
