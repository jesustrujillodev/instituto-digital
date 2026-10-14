# Integración y E2E

Las pruebas unitarias ([00-inventario-tests.md](./00-inventario-tests.md)) ejercitan la
lógica con dobles. Estas dos capas comprueban lo que los dobles no pueden: que la
plataforma funciona contra los servicios reales con los que se despliega. Ninguna corre
en los hooks de husky: necesitan Docker y tardan minutos.

| Capa | Comando | Contra qué | Qué responde |
|---|---|---|---|
| Integración | `bun run test:integration` | Postgres, Redis, MinIO y Mailpit de `compose.test.yml`, desde el host | ¿El SQL crudo, las colas, los adaptadores de Redis, S3 y SMTP hacen lo que prometen? |
| E2E | `bun run test:e2e` | La imagen del `Dockerfile`, en las dos formas de despliegue | ¿Lo que se despliega arranca y sus flujos cruzan bien todos los servicios? |

Las dos aceptan `--keep` para dejar el entorno arriba al terminar, y lo que va después
de `--` pasa al runner:

```bash
bun run test:integration -- app/shared/queue        # solo un directorio
bun run test:e2e --keep -- --project=queued         # una topología, sin bajar nada
docker compose -f compose.test.yml --profile app down -v   # bajarlo después
```

## 1. El entorno: `compose.test.yml`

Es un proyecto aparte (`idc-test`) con puertos propios, así que convive con
`compose.yml`. Todo vive en `tmpfs`, sin volúmenes, y `down -v` lo borra.

| Servicio | Puerto en el host | Para qué |
|---|---|---|
| `postgres` | `55432` | Tres bases: `idc_integration`, `idc_queued` e `idc_inline`. |
| `redis` | `56379` | Con los mismos flags que producción (`noeviction`, AOF). |
| `minio` + `minio-init` | `59000` | Un par de buckets (privado y público) por consumidor. |
| `mailpit` | `51025` SMTP, `58025` API | Recibe todo el correo; las pruebas lo leen por su API. |
| `caddy` (perfil `app`) | — | TLS delante de la app y del bucket (ver §3). |
| `caddy-ca` (perfil `app`) | — | Copia el certificado raíz de Caddy (no la llave) legible para el usuario `node` de la imagen. |
| `db-setup` (perfil `app`) | — | `prisma db push` y seed en las bases de E2E. |
| `web`, `worker` (perfil `app`) | — | Forma **queued**: web + Redis + worker. |
| `web-inline` (perfil `app`) | — | Forma **inline**: solo web, sin Redis, como QA hoy. |
| `playwright` (perfil `e2e`) | — | El runner, dentro de la red de compose. |

**Nunca toca Neon.** La base dev es compartida y su outbox envía correo real. El
`globalSetup` de la integración (`vitest.integration.setup.ts`) aborta antes de
conectarse si `DATABASE_URL` no apunta a `127.0.0.1:55432`. Además
`vitest.integration.config.ts` desactiva el `.env` del desarrollador
(`DOTENV_CONFIG_PATH`), para que ninguna variable de ahí se cuele en la corrida.

**El schema va por `db push`, sin `--force-reset`.** No hay `prisma/migrations`, y la
base nace vacía en cada `up`. Prisma además bloquea `--force-reset` cuando lo lanza un
agente de IA.

## 2. Integración (Vitest)

Archivos `*.int.test.ts` dentro del `__tests__/` de la capa que prueban, con el mismo
nombre que el archivo bajo prueba (`notifications.repository.server.int.test.ts`).
`vitest.config.ts` los excluye: `bun run test` y el pre-push no cambian.

Reglas de construcción:

- **Sin dobles de lo que se prueba.** Se usa el `prisma` real de `app/core/db.server.ts`,
  y el cradle de `createSystemContainer()` cuando hace falta el cableado completo.
- **Cada prueba crea y borra sus filas.** `app/core/__tests__/db.fixtures.ts` arma lo
  mínimo (dependencia, persona, curso, línea del plan) con nombres únicos y lo borra en
  el orden de las FK. No hay TRUNCATE ni SQL de prueba.
- **Los archivos van en fila** (`fileParallelism: false`). Una prueba que reclama "lo
  vencido" del outbox no debe tomar filas de otra.
- **Los bloqueos se prueban con `raceTransactions`.** Una transacción toma el bloqueo y
  lo retiene. La otra intenta tomarlo, y el orden en que terminan dice si esperó:
  `["released", "first", "second"]` si esperó; `["second", "released", "first"]` si no.

| Área | Archivos | Qué protegen |
|---|---|---|
| SQL crudo | `*/infrastructure/__tests__/*.repository.server.int.test.ts` (enrollments, courses, annual-plan, users, notifications, security-state) | `FOR UPDATE` / `FOR SHARE` serializan lo que deben y nada más; `claimDue` con `SKIP LOCKED` no entrega el mismo correo a dos workers; el epoch y el lockdown usan la hora de Postgres. |
| Colas | `shared/queue/__tests__/queue.processor.server.int.test.ts`, `job-dispatcher.queued.server.int.test.ts` | El cableado de `app/worker.server.ts` con los handlers reales: correo a Mailpit, borrado en MinIO, fallo definitivo en `job_failure`, cierre ordenado. Se encola tras el commit, un rollback no deja trabajo y, sin Redis, corre el respaldo. |
| Redis | `shared/cache/__tests__/*.redis.server.int.test.ts`, `shared/storage/__tests__/signed-url-cache.redis.server.int.test.ts` | El aviso de invalidación cruza procesos y no cruza prefijos; la caché versionada se comparte entre nodos; las URLs firmadas vencen con su TTL. |
| Storage | `shared/storage/__tests__/s3.adapter.int.test.ts` | El adaptador S3 contra MinIO: subir, URL de subida firmada (y que rechace otro `Content-Type`), URL de lectura, listado paginado, borrado en lote, separación de buckets. |
| Correo | `shared/mail/__tests__/mailer.factory.server.int.test.ts` | El mailer SMTP entrega asunto, texto, html y remitente. |

Los dos archivos que ya traían un bloque contra Redis real
(`queue.client.server.test.ts` y `rate-limiter.redis.server.test.ts`) también corren
aquí: la configuración les da `REDIS_TEST_URL`.

## 3. E2E (Playwright)

Corre contra la **imagen del `Dockerfile`** con `NODE_ENV=production`. Lo que se
prueba es lo que va a Railway: el build, el Chromium de Alpine, `build/worker/` y la
validación del entorno al arrancar.

### Por qué hay TLS y por qué Playwright corre en un contenedor

En producción `APP_BASE_URL` exige `https://`, y con él las cookies van `Secure` y con
prefijo `__Host-`. Caddy hace de borde, como Railway: `https://queued.idc.test`,
`https://inline.idc.test` y `https://storage.idc.test` (el bucket). El bucket también
va por https porque el navegador bloquearía la subida directa desde una página https
(contenido mixto). La app confía en la CA interna de Caddy por `NODE_EXTRA_CA_CERTS`, y
el navegador la ignora (`ignoreHTTPSErrors`).

Las URLs firmadas llevan el host del bucket dentro de la firma. Por eso el navegador
tiene que resolver `storage.idc.test` igual que la app: Playwright corre dentro de la
red de compose, con la imagen `mcr.microsoft.com/playwright` de la **misma versión
exacta** que `@playwright/test` en `package.json`. Al subir una, se sube la otra.

### Estructura

```
e2e/
├── playwright.config.ts   proyectos queued e inline, cada uno con su login previo
├── support/               topologías, fixtures (Mailpit, bucket), helpers de cursos y usuarios
├── specs/                 una spec por flujo
└── docker/                Caddyfile, init de Postgres, buckets de MinIO, override de CI
```

Las specs son de caja negra: no importan nada de `app/`. Lo que comprueban fuera del
navegador lo leen de Mailpit (API HTTP) y de MinIO (`HeadObject`).

| Spec | Qué cruza |
|---|---|
| `arranque` | La imagen arranca en producción, sirve los assets con caché inmutable y el gate de sesión funciona. |
| `sesion` | Login, cookies `__Host-` (`HttpOnly`, `Secure`, `SameSite=Lax`), logout, límite por correo y revocación de las sesiones de un usuario: lo expulsa en segundos (epoch por Redis en queued, en proceso en inline). |
| `correo` | Un alta escribe el aviso en el outbox y llega al SMTP con el enlace del dominio público: por cola y worker (queued) o por el poller (inline). |
| `archivos` | Material de sesión: la app firma, el navegador sube al bucket, la app lo verifica, lo sirve por el proxy y al quitarlo lo borra con `delete-object`. |
| `certificados` | La muestra del certificado sale en PDF y PNG del Chromium de la imagen. |
| `verificacion` | `/verificar/:id` responde sin sesión. |

Falta el recálculo de avance (`recalculate-progress`, cola `course-sync`) de punta a
punta. Comprobarlo exige inscribir a alguien en un curso a su ritmo, avanzar lecciones y
cambiar el temario desde la UI. El worker que lo consume es el mismo que ya prueban
`correo` y `archivos`.

Además, `bun run test:e2e` comprueba al final que el worker se detiene limpio con
`SIGTERM`: código de salida 0 y `worker stopping` en el log.

### Depurar un fallo

- `e2e/.report/`: el reporte HTML.
- `e2e/.results/`: los traces de cada spec fallida y `compose.log` con los logs de
  todos los contenedores. Un trace se abre con
  `node node_modules/@playwright/test/cli.js show-trace <zip>`.
- `--keep` deja todo arriba. Las bases se consultan en `127.0.0.1:55432` y el correo en
  `http://127.0.0.1:58025`.

## 4. CI

`.github/workflows/integracion.yml` corre en cada PR y en `main`:

1. **integration**: `bun run test:integration`.
2. **e2e**: `bun run test:e2e`, con la caché de capas de la imagen en la caché de
   Actions (`e2e/docker/compose.ci.yml`, vía `COMPOSE_TEST_OVERRIDE`). Después
   comprueba que la imagen **no arranca** con los secretos de ejemplo. Si algo falla,
   sube el reporte y los traces como artefacto.

## 5. Lo que estas pruebas encontraron

**Corregido en este cambio:**

- **Todo action respondía 400 detrás de un proxy con TLS.** Al subir React Router de
  7.12 a 7.18.4 y cambiar `react-router-serve` por `app/http.server.ts`, Express no
  confiaba en el proxy: `request.url` quedaba en `http://` y la protección CSRF de
  React Router rechazaba el `Origin: https://…` del navegador. Login incluido. Ahora
  `trust proxy` sale de `CLIENT_IP_SOURCE`/`TRUSTED_PROXY_HOPS`
  ([http/00](../http/00-ip-del-cliente.md)).

**Reportados, sin corregir:**

- **Los CHECK de la base no están en el repositorio.** `users_type_coherence` y
  `certificate_templates_scope_coherence` existen solo como DDL manual documentado en
  [dependencies/00](../dependencies/00-dependencias-y-alcance.md) y
  [adr/0030](../adr/0030-biblioteca-de-plantillas-y-logos.md). Una base creada con
  `db push`, como la de estas pruebas, nace sin ellos. Sin `prisma/migrations`, lo mismo
  le pasaría a un entorno nuevo.
- **Una base nueva necesita la fila de `security_state`.** Sin ella, cada lectura del
  estado de seguridad lanza ("run the seed"). La crean el seed y `bun run bootstrap`.
- **El `HEALTHCHECK` de la imagen pide `/`**, que no revisa ni la base ni Redis, y el
  worker no tiene healthcheck (por eso compose se lo desactiva).
