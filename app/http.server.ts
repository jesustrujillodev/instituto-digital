/**
 * Servidor HTTP de producción: lo mismo que `react-router-serve` (compresión,
 * estáticos con caché, handler de React Router) salvo el log de acceso, que no
 * escribe credenciales (`redactAccessUrl`). `react-router-serve` registra con
 * morgan la URL completa y no deja cambiarlo.
 *
 * `node --enable-source-maps build/http/index.js`, desde la raíz del proyecto.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import type { ServerBuild } from "react-router";
import { formatAccessLine } from "@/shared/http/access-log";

// Antes de cargar la app, que valida el entorno al importarse.
process.env.NODE_ENV = process.env.NODE_ENV ?? "production";

const BUILD_DIR = path.resolve("build");
const CLIENT_DIR = path.join(BUILD_DIR, "client");

const build: ServerBuild = await import(
	pathToFileURL(path.join(BUILD_DIR, "server/index.js")).href
);

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(
	"/assets",
	express.static(path.join(CLIENT_DIR, "assets"), {
		immutable: true,
		maxAge: "1y",
	}),
);
app.use(express.static(CLIENT_DIR, { maxAge: "1h" }));

// Después de los estáticos, como hacía morgan: solo se registran las páginas y
// los datos.
app.use((request, response, next) => {
	const startedAt = performance.now();
	response.on("finish", () => {
		console.log(
			formatAccessLine({
				method: request.method,
				url: request.originalUrl,
				status: response.statusCode,
				contentLength: response.getHeader("Content-Length")?.toString(),
				ms: performance.now() - startedAt,
			}),
		);
	});
	next();
});

app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const port = Number(process.env.PORT ?? 3000);
const server = process.env.HOST
	? app.listen(port, process.env.HOST)
	: app.listen(port);
server.on("listening", () => {
	console.log(`[http] escuchando en el puerto ${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.once(signal, () => server.close());
}
