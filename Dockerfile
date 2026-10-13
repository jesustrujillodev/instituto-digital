# syntax=docker/dockerfile:1

# Las imágenes base van fijadas por digest (resuelto el 12-10-2026): una etiqueta
# como `22-alpine` cambia de contenido sin aviso. Para actualizarlas se resuelve
# el digest nuevo de la misma etiqueta y se reemplaza aquí.

# ── Base: Bun para instalar dependencias y construir ─────────────────────────
FROM oven/bun:1.3-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS base
WORKDIR /app
# prisma.config.ts resuelve DATABASE_URL al cargarse, así que `prisma generate`
# no arranca sin ella. No conecta a la base de datos: un valor ficticio de build
# es suficiente (el runtime usa la variable real de Railway/Neon).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# ── Dependencias de producción (las que viajan a la imagen final) ────────────
FROM base AS production-dependencies-env
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
# El cliente de Prisma se genera DENTRO de node_modules (node_modules/.prisma),
# por eso hay que generarlo en la misma capa que luego se copia al runtime.
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN bunx prisma generate

# ── Dependencias completas + build de React Router ───────────────────────────
FROM base AS build-env
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bunx prisma generate && bun run build

# ── Runtime: Node ejecutando el servidor HTTP (app/http.server.ts) ──────────
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# curl para el HEALTHCHECK (overhead mínimo en alpine).
# Chromium exporta los certificados a PDF y PNG (docs/adr/0019): el que trae
# puppeteer no corre en musl, así que se usa el de Alpine. ttf-liberation da la
# serif del cuerpo del certificado (métricas de Times New Roman).
# Chromium no se fija a una versión exacta: Alpine retira la anterior al publicar
# un parche de seguridad, y el build dejaría de construir. La versión la acota la
# rama de Alpine de la imagen fijada arriba.
RUN apk add --no-cache curl chromium ttf-liberation
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
# El contenedor corre como `node`, sin privilegios para el sandbox de Chromium.
# El documento que abre es HTML propio, sin JavaScript ni red.
ENV CHROMIUM_NO_SANDBOX=true

# Copiar solo lo necesario al runtime — de menor a mayor volatilidad
# para maximizar la reutilización de capas entre redeploys.
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --from=production-dependencies-env --chown=node:node /app/node_modules ./node_modules
COPY --from=build-env --chown=node:node /app/build ./build

USER node
EXPOSE 3000

# Las migraciones se aplican externamente (CI/CD o script manual contra Neon)
# antes del deploy, por lo que el contenedor solo levanta el servidor.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f "http://localhost:${PORT}/" || exit 1

CMD ["node", "--enable-source-maps", "build/http/index.js"]