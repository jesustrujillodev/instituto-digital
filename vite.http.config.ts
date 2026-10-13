import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// El servidor HTTP de producción (app/http.server.ts) va aparte del build de
// React Router, que es lo que carga al arrancar. Las dependencias quedan fuera
// del bundle y se resuelven desde node_modules.
export default defineConfig({
	plugins: [tsconfigPaths()],
	// Los archivos de public/ ya los sirve el build del cliente.
	publicDir: false,
	build: {
		ssr: true,
		outDir: "build/http",
		emptyOutDir: true,
		target: "node22",
		rollupOptions: {
			input: { index: "app/http.server.ts" },
			output: { entryFileNames: "[name].js" },
		},
	},
});
