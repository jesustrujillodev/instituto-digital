# syntax=docker/dockerfile:1

# ── Base: Bun para instalar dependencias y construir ─────────────────────────
FROM oven/bun:1.3-alpine AS base
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

# ── Runtime: Node ejecutando react-router-serve ──────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# curl para el HEALTHCHECK (overhead mínimo en alpine).
# Chromium exporta los certificados a PDF y PNG (docs/adr/0019): el que trae
# puppeteer no corre en musl, así que se usa el de Alpine. ttf-liberation da la
# serif del cuerpo del certificado (métricas de Times New Roman).
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

CMD ["node", "node_modules/@react-router/serve/bin.js", "./build/server/index.js"]