import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	optimizeDeps: {
		// El escaneo de dependencias en desarrollo recorre también los `.server`
		// y llega al exportador de certificados. puppeteer-core nunca va al
		// navegador, y preempaquetarlo falla con `yargs` (esbuild no acepta su
		// `export ... as 'module.exports'`), lo que deja la app sin hidratar.
		exclude: ["puppeteer-core"],
	},
});
