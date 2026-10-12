import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// El worker de colas (app/worker.server.ts) se empaqueta aparte de la app web:
// mismo código y mismos alias, sin React Router. Las dependencias quedan fuera
// del bundle y se resuelven desde node_modules, como en el servidor web.
//
// Junto a él va el worker_thread que sanea los fondos PDF (pdf-sanitize.js): lo
// lanzan el servidor web y el de colas con `new Worker`, así que necesita su
// propio archivo y no puede ir dentro de un bundle.
export default defineConfig({
	plugins: [tsconfigPaths()],
	build: {
		ssr: true,
		outDir: "build/worker",
		emptyOutDir: true,
		target: "node22",
		rollupOptions: {
			input: {
				index: "app/worker.server.ts",
				"pdf-sanitize":
					"app/modules/certificates/infrastructure/pdf-sanitize.worker.server.ts",
			},
			output: { entryFileNames: "[name].js" },
		},
	},
});
