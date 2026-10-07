import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// El worker de colas (app/worker.server.ts) se empaqueta aparte de la app web:
// mismo código y mismos alias, sin React Router. Las dependencias quedan fuera
// del bundle y se resuelven desde node_modules, como en el servidor web.
export default defineConfig({
	plugins: [tsconfigPaths()],
	build: {
		ssr: "app/worker.server.ts",
		outDir: "build/worker",
		emptyOutDir: true,
		target: "node22",
		rollupOptions: { output: { entryFileNames: "index.js" } },
	},
});
