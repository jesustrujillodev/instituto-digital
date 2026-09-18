# Sistema de almacenamiento (Storage) — Referencia de punta a punta

**Última actualización:** 2026-09-14 · Este documento describe el sistema **como
está implementado**. Registra el *qué* y el *cómo* de la abstracción de
almacenamiento de objetos (S3/GCS) integrada en el proyecto.

---

## 1. Visión general

Abstracción de **almacenamiento de objetos** tras **una sola interfaz de dominio**
(`IStorageProvider`) para subir, leer, listar, borrar, comprobar y firmar URLs de
archivos, con **dos adaptadores intercambiables** (S3 y GCS) seleccionados en
runtime por variable de entorno. El resto de la aplicación (servicios, actions,
loaders) **nunca conoce el proveedor concreto** — solo depende del puerto.

| Capacidad | Método del puerto |
|---|---|
| Crear bucket (idempotente) | `createBucket(bucket)` |
| Subir archivo (Buffer / string / Uint8Array) | `uploadFile(bucket, key, body, contentType?)` |
| Descargar a `Buffer` | `getFile(bucket, key)` |
| Listar keys por prefijo | `listFiles(bucket, prefix?)` |
| Listar paginado, con metadatos y por carpetas | `listObjects(bucket, { prefix, delimiter, cursor, limit })` |
| Borrar archivo | `deleteFile(bucket, key)` |
| Borrar en lote (sin lanzar por fallos parciales) | `deleteFiles(bucket, keys)` |
| Comprobar existencia | `fileExists(bucket, key)` |
| Referencia pública/estable (proxy interno) | `getPublicUrl(bucket, key)` |
| URL firmada temporal (`inline` o `attachment`) | `getPresignedUrl(bucket, key, expiresInSeconds?, { disposition })` |

Principios:

- **`getPublicUrl` NO devuelve la URL del proveedor**, devuelve una referencia
  interna estable (`/api/storage?key=...`). Lo que se persiste en la BD es esa
  referencia, que sobrevive a un cambio de S3 ↔ GCS o de dominio. La resolución
  real (firmar o hacer streaming) ocurre en el **proxy** (§6).
- **La selección de proveedor es por entorno** (`STORAGE_PROVIDER`), sin cambios
  de código. Añadir un tercer proveedor = un adaptador nuevo + una rama en la
  factory; los consumidores no cambian.
- **Arquitectura hexagonal/screaming**: el puerto no importa ningún SDK; los
  adaptadores importan el puerto, nunca al revés. Es una **plantilla** replicable
  (§10), igual que el [sistema de autenticación](../auth/00-sistema-autenticacion.md).
- **El provider es un singleton de proceso**: cierra sobre el cliente del SDK
  (`S3Client`/`Storage`) y se construye **una vez**, no por petición.

## 2. Estructura y responsabilidades

```
app/
├── core/
│   └── env.server.ts              validación fail-fast del entorno; incluye la
│                                   validación CONDICIONAL de storage por proveedor
├── shared/storage/
│   ├── storage.port.ts            ← PUERTO: IStorageProvider + StorageConfig (cero deps)
│   ├── s3.adapter.ts              adaptador S3 (AWS SDK v3) — logger inyectado
│   ├── gcs.adapter.ts             adaptador GCS (@google-cloud/storage) — logger inyectado
│   ├── storage.factory.ts         selección de adaptador (createStorageProvider[FromEnv])
│   ├── storage.utils.ts           getKeyFromUrl() — parseo de la referencia proxy
│   ├── object-key.ts              buildObjectKey() — prefijo + nombre sanitizado + timestamp
│   ├── mime.ts                    contentTypeForKey() — extensión → content-type
│   ├── storage.policy.ts          política por prefijo: visibilidad, bucket y caché
│   ├── public-url.ts              createAssetUrlResolver() — key → URL con la que se pinta
│   ├── storage.transaction.ts     withStorageTransaction() — lote + rollback (§5.4)
│   ├── storage.listing.ts         collectObjects() — recorre un prefijo entero con tope
│   ├── object-reference.port.ts   IObjectReferenceSource — "¿quién usa esta key?" (gestor de nube)
│   ├── upload-validation.ts       validateUploadInput() — allowlist de tipo + tamaño
│   ├── storage.errors.ts          StorageBatchError / StorageValidationError (tipados)
│   ├── routes.config.ts           registra la resource route del proxy
│   └── routes/storage.route.ts    ← PROXY HTTP (resource route de React Router)
├── shared/di/
│   ├── container.types.ts         ICradle expone storageProvider: IStorageProvider
│   └── container.server.ts        registro del singleton de proceso (asValue)
└── (sin consumidor en rutas hoy — ver nota en §5.1)
```

**Regla de dependencias:** `consumidores → IStorageProvider (puerto) ← adaptadores`.
El puerto no importa nada de fuera; los consumidores dependen solo del puerto; los
adaptadores (S3, GCS) dependen hacia adentro. El único punto acoplado al framework
es el proxy (`routes/storage.route.ts`).

```
consumidores (actions / loaders / services)
        │  dependen SÓLO de ▼
   IStorageProvider  (shared/storage/storage.port.ts)   ← el puerto
        ▲  implementado por ▼
 s3.adapter / gcs.adapter                                ← los adaptadores
        ▲  construidos por ▼
   storage.factory  →  registrado en el DI como singleton de proceso
```

## 3. Modelo de datos y convención de referencias

Storage **no tiene tablas propias**: los consumidores persisten una **referencia**
de tipo string en sus propios modelos. El consumidor de ejemplo añade una columna
al modelo `User`:

```prisma
User   { …, photoUrl String?, … }        // referencia proxy, NO la URL del proveedor
Course { …, coverImageUrl String?, … }   // idem, bajo media/portadas/
```

**Formato de la referencia persistida:** `/api/storage?key=<key-encoded>`.

**Convención de `key`** (la produce `buildObjectKey`):

```
<prefijo-lógico>/<nombre-sanitizado>-<timestamp><ext>
   p. ej.  profile-photos/foto-1784006709346.png

Opcional: una carpeta por dueño DENTRO del prefijo, con su slug
   media/curso-induccion-2026/portada-1784006709346.jpg
   documentos/curso-induccion-2026/constancia-1784006709999.pdf
```

El prefijo va **delante** del slug: la política decide por el inicio de la key,
así que lo público y lo privado conservan su visibilidad y su bucket aunque
compartan nombre de carpeta. El módulo dueño es quien construye ese nombre, y
debe validar el slug antes de meterlo en la key.

- El **prefijo lógico** actúa como "carpeta" y **decide la visibilidad** (§6):
  prefijos públicos vs privados. Convención inicial: `profile-photos/`, `media/`
  (públicos); todo lo demás (p. ej. `documentos/`) privado.
- El **nombre se sanitiza** (`[^a-zA-Z0-9.-] → _`) para eliminar separadores de
  ruta y evitar *path traversal*; el **timestamp** evita colisiones.

Invariante: **en la BD se guarda la referencia proxy, nunca la URL del
proveedor.** Es la frontera de desacoplamiento — mientras se respete, cambiar
S3 ↔ GCS es solo cambiar variables de entorno.

## 4. Configuración

Validada **al arrancar** en `core/env.server.ts`. Las variables de storage son
opcionales a nivel de campo, pero la exigencia es **condicional al proveedor**:
si `STORAGE_PROVIDER` está definido pero le faltan variables, el proceso **falla
al boot** con un mensaje claro (no un 500 en runtime). Si `STORAGE_PROVIDER` se
omite, la feature queda inactiva y la app arranca igual.

**Comunes**

| Variable | Uso |
|---|---|
| `STORAGE_PROVIDER` | `"s3"` (default en la factory) o `"gcs"` |
| `STORAGE_BUCKET_NAME` | Bucket por defecto que usan los consumidores y el proxy |

**S3 / compatibles (MinIO, R2, Spaces)** — requeridas si `STORAGE_PROVIDER=s3`:

| Variable | Uso |
|---|---|
| `STORAGE_REGION` | Región (p. ej. `us-east-1`) |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Credenciales |
| `STORAGE_ENDPOINT` | Endpoint custom (MinIO/R2/Spaces). **Omitir para AWS real** |
| `STORAGE_FORCE_PATH_STYLE` | `"true"` para MinIO/endpoint custom; **`"false"` en AWS real** (path-style está deprecado) |
| `STORAGE_PUBLIC_BUCKET_NAME` | Bucket que aloja los `CDN_PREFIXES`. Opcional; ausente = modo un solo bucket (§7.2) |
| `STORAGE_PUBLIC_DOMAIN` | Origen público absoluto del CDN (p. ej. `https://cdn.dominio.com`). Opcional, pero **acoplada** a la anterior: definir una sin la otra falla al boot (§7.2) |

**GCS** — requiere `STORAGE_BUCKET_NAME` + una fuente de credenciales:

| Variable | Uso |
|---|---|
| `GCS_CREDENTIALS_BASE64` | JSON de service-account en base64 (recomendado en PaaS) |
| `GCS_CREDENTIALS_PATH` | Ruta al `service-account.json` |
| `USE_GCS_EMULATOR` / `GCS_EMULATOR_HOST` | Emulador local (fake-gcs-server) |

Ejemplo local con MinIO (ver `compose.yml` y `.env.example`):

```env
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_FORCE_PATH_STYLE=true
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_BUCKET_NAME=instituto-digital-storage
```

El `compose.yml` levanta MinIO (API `:9000`, consola `:9001`) y un contenedor
efímero `minio/mc` que crea el bucket al arrancar (idempotente).

## 5. Flujos

### 5.1 Subida (patrón de referencia)

> **Actualización (2026-09-17):** `withStorageTransaction` ya tiene un consumidor
> vivo: la **portada del curso**
> ([courses §7.1](../courses/00-cursos-sesiones-y-acceso.md)). `create` y
> `update` de `courseService` envuelven su `runInTransaction` con la transacción
> de storage, así que un guardado fallido revierte la subida. El flujo de abajo
> describe el patrón simple (subida suelta sin transacción), que sigue siendo el
> de la foto de perfil.

```
Usuario sube File (multipart)
  → requireAuth (solo su propia foto)
  → valida tipo (allowlist de imágenes) y tamaño (≤ 5 MB) ANTES de subir
  → key = buildObjectKey("profile-photos", file.name)   // sanitizado + timestamp
  → buffer = Buffer.from(await file.arrayBuffer())
  → storageProvider.uploadFile(bucket, key, buffer, file.type)
  → photoUrl = storageProvider.getPublicUrl(bucket, key)   // → /api/storage?key=...
  → userRepository.updatePhoto(documentId, photoUrl)        // persiste la referencia
  → borra la foto anterior best-effort (§5.3)
```

La validación de tipo/tamaño vive en el **consumidor** (la action), no en el
adaptador: el puerto es agnóstico al caso de uso.

### 5.2 Lectura / visualización

```
Front renderiza <img src="/api/storage?key=profile-photos/...&inline=true">
  → proxy modo inline → getFile → responde el archivo con Content-Type correcto
   ── o ──
Front navega a "/api/storage?key=..."
  → proxy → bucketForKey(key) → getPresignedUrl(300 s) → 302 a la URL firmada
   ── o, con el CDN activo (§7.2) ──
Front renderiza <img src="https://cdn…/media/..."> resuelto por
assetUrlResolver: el navegador va directo al dominio público, sin pasar por
nuestro servidor y con caché normal (la firma rotatoria la impedía)
```

### 5.3 Reemplazo / borrado (best-effort)

```
Nueva foto llega
  → getKeyFromUrl(user.photoUrl)   // referencia guardada → key cruda
  → uploadFile(nueva) → getPublicUrl → persiste la nueva referencia
  → storageProvider.deleteFile(bucket, oldKey).catch(log)   // best-effort
```

El borrado del objeto viejo es **best-effort** (`.catch` + `logger.warn`): no debe
bloquear la actualización si el objeto ya no existe.

### 5.4 Subida en lote y transacción compensatoria

`shared/storage/storage.transaction.ts` provee un **unit-of-work** que hace la
limpieza de huérfanos **nativa**: el consumidor solo ejecuta su lógica y, si algo
lanza, storage revierte las subidas por él. No rastrea keys ni llama a
`deleteFile`. Construido **sobre el puerto** (`uploadFile`/`deleteFile`/
`getPublicUrl`) — no lo modifica, así funciona igual para S3 y GCS.

```ts
const article = await withStorageTransaction(
  { provider: storageProvider, logger, bucket,
    validation: { allowedTypes, maxBytes, maxCount } },
  async (tx) => {
    const imgs = await tx.uploadMany("media", files);     // sube N en paralelo
    return articleRepo.create({ images: imgs.map((i) => i.url) }); // si lanza → rollback
  },
);
```

Semántica:

- **`tx.upload` / `tx.uploadMany`** validan (tipo/tamaño/conteo) **antes** de subir
  (`StorageValidationError` si algo no valida, sin subir nada). `uploadMany` sube
  en **paralelo** y es **todo-o-nada**: si alguna subida falla, lanza
  `StorageBatchError` con los nombres fallidos y el wrapper revierte lo ya subido.
- **El wrapper** revierte TODAS las subidas registradas si el callback lanza —
  incluido un fallo en un paso **posterior** (p. ej. el guardado en BD). En éxito,
  las subidas se **commitean** (no se borran) y devuelve el resultado del callback.
- El rollback es **best-effort** (borra en paralelo, loguea las keys que no pudo
  borrar) y **nunca enmascara** el error original: siempre se re-lanza.
- **Reintentos transitorios**: los cubren los SDKs de AWS/GCS con backoff; la
  transacción **no** añade un loop propio (duplicaría reintentos).

Devuelve `StorageRef[]` (`{ key, url, originalName }`); se persiste `url` (la
referencia proxy). El caso canónico es: si la escritura en base de datos que
referencia el archivo falla, la subida se revierte y no quedan huérfanos.

## 6. El proxy (resource route de React Router)

`app/shared/storage/routes/storage.route.ts` es la contraparte de `getPublicUrl` y
el **único punto acoplado al framework**. Es una *resource route* (solo `loader`,
sin componente) registrada en `routes.config.ts` como `GET /api/storage`. Corre
dentro del middleware global de `root.tsx`, así que recibe el `storageProvider` ya
inyectado en el contexto.

Orden de resolución del `loader`:

1. **Resolver la `key`** de `?key=` (o `?url=` legado, o una key que venga como
   URL del proxy), delegando en `getKeyFromUrl`. Sin key → `404`.
2. **Bucket** desde `env.STORAGE_BUCKET_NAME`. Ausente → `500` "Storage
   Misconfigured".
3. **Autorización mixta por prefijo** (§7): si `!isPublicKey(key)` →
   `requireAuth(request, context)` (lanza redirect a `/iniciar-sesion` si no hay
   sesión). Los objetos públicos se sirven sin sesión.
4. **Dos modos:**
   - `?inline=true` → **streaming del archivo** (`getFile`) con `Content-Type`
     inferido por extensión (`contentTypeForKey`) y `Content-Disposition: inline`.
     **Cap de 15 MB**: por encima responde `413` en vez de bufferizar en memoria.
     Útil para incrustar imágenes/PDF sin exponer al proveedor.
   - por defecto → **URL firmada** (300 s) + `redirect(signedUrl)`. El navegador
     va directo al proveedor para la descarga real (el archivo no pasa por
     nuestro servidor).
5. `try/catch` con el logger del proyecto; un redirect de `requireAuth` (que es un
   `Response`) se re-lanza tal cual; cualquier otro error → `500` controlado.

## 7. Autorización (política por prefijo)

`shared/storage/storage.policy.ts` es el **único punto de verdad** de la
visibilidad: `isPublicKey(key)` comprueba si la key empieza por un prefijo del
allowlist (`PUBLIC_PREFIXES`). Todo lo que **no** empiece por un prefijo público
es privado por defecto (**fail-closed**).

- **Público** (sin sesión): `profile-photos/`, `media/`.
- **Privado** (exige `requireAuth`): cualquier otro prefijo (p. ej. `documentos/`).

Las portadas de curso viven en `media/portadas/`: heredan la visibilidad y el
bucket de `media/` —la política mira el inicio de la key— y la subcarpeta propia
permite que el gestor de nube la nombre sin apropiarse de `media/`, que es de
todo el proyecto.

Cambiar la política = editar `PUBLIC_PREFIXES` en un solo archivo; el proxy la
consume automáticamente. Para autorización más fina (p. ej. "solo el dueño ve su
documento") se colgaría de `requireAuth`/`requireRole` en el proxy, igual que en
el resto de la app.

### 7.1 Qué pasa por nuestro servidor y qué no

La política por prefijo tiene una consecuencia operativa que conviene dejar
explícita: **todas** las imágenes — públicas y privadas — se piden a *nuestro*
servidor, porque lo que se persiste en BD es la referencia proxy (§3), no la URL
del proveedor. Lo que cambia entre modos es **qué** viaja por ahí.

Ruta de una imagen pública (modo por defecto):

```
navegador → GET /api/storage?key=media/abc.jpg      ← a NUESTRO servidor
          ← 302 Location: https://<cuenta>.r2…/media/abc.jpg?X-Amz-Signature=…
navegador → GET <URL firmada>                          ← al PROVEEDOR
          ← los bytes de la imagen
```

| | Modo por defecto (302 firmado) | Modo `?inline=true` |
|---|---|---|
| Peticiones a nuestro servidor | 1 por imagen | 1 por imagen |
| **Bytes por nuestro servidor** | **0** | el archivo completo |
| Trabajo por petición | firmar (HMAC local, sin red) | descargar del proveedor + reenviar |
| Round-trips del navegador | 2 | 1 |

Hoy **ningún consumidor de la UI usa `?inline=true`**: se pinta la `url` tal
cual, que es la referencia proxy. Es decir, el ancho de banda de las imágenes
**nunca pasa por nuestro servidor**; lo que gastamos es una petición barata por
imagen y un round-trip extra de latencia.

Orden de magnitud: un listado con miniaturas de 25 filas son ~25 peticiones al
proxy en la carga inicial (mitigadas por `loading="lazy"`).

**El coste real no es el ancho de banda, es la caché.** La URL firmada lleva un
`X-Amz-Date`/`X-Amz-Signature` nuevos en cada petición, así que para el navegador
**es una URL distinta cada vez** y no puede reutilizar la imagen que ya descargó.
Paginar, volver atrás o revisitar mañana vuelve a bajar los mismos bytes. El `302`
tampoco se cachea (se emite sin `Cache-Control`).

### 7.2 El bucket público y el CDN

La política del §7 decide **tres** cosas a partir del prefijo de la key, no una.
Son la misma decisión vista desde tres capas:

| La key decide… | Constante / función | Efecto |
|---|---|---|
| Si el proxy exige sesión | `PUBLIC_PREFIXES` / `isPublicKey` | `requireAuth` en el proxy |
| En qué bucket vive | `CDN_PREFIXES` / `bucketForKey` | bucket público vs. por defecto |
| Con qué `Cache-Control` se sube | `cacheControlForKey` | inmutable un año vs. `no-store` |

`CDN_PREFIXES = ["media/"]` y es un **subconjunto** de `PUBLIC_PREFIXES`: un
objeto servido por un dominio abierto no puede exigir sesión. El invariante está
testeado (`storage.policy.test.ts`). `profile-photos/` queda deliberadamente
fuera del CDN: son pocas, las ve solo el panel y son dato de personal.

**Los tres modos**, sin cambios de código:

| Modo | Configuración | Comportamiento |
|---|---|---|
| Un bucket (**por defecto**) | ninguna variable | todo al bucket por defecto, todo por el proxy. Es lo que corre en local con MinIO |
| Un bucket, nada público | ninguna variable + `PUBLIC_PREFIXES = []` y `CDN_PREFIXES = []` | almacenamiento privado puro: todo exige sesión |
| Dos buckets, **sin dominio** | `STORAGE_PUBLIC_BUCKET_NAME` | `media/` vive en su propio bucket pero se sirve por el proxy. Paso previo al CDN: cuando llegue el dominio no hay que mover objetos |
| Dos buckets + CDN | `STORAGE_PUBLIC_BUCKET_NAME` + `STORAGE_PUBLIC_DOMAIN` | `media/` al bucket público servido por dominio propio, con caché |

#### Por qué un bucket aparte y no un prefijo

Un Custom Domain de R2 se monta sobre el bucket **entero**, no sobre un prefijo.
Con un solo bucket, `cdn.dominio.com/documentos/factura-…pdf` sería una URL
pública y permanente — y la key la conoce cualquiera que alguna vez descargó ese
documento, porque va visible en `/api/storage?key=…`. Con dos buckets, lo privado
no está *físicamente* en el bucket expuesto: no hay nada que configurar mal.

Por eso `env.server.ts` hace que **el dominio exija el bucket** — y solo en esa
dirección. Definir el dominio sin el bucket separado es exactamente la
configuración que expondría el expediente: el proceso no arranca. Al revés es
seguro y además útil, así que se permite: el bucket público sin dominio deja los
objetos de catálogo ya separados, sirviéndose por el proxy, y activar el CDN más
tarde es añadir una variable sin mover nada.

#### Dónde se resuelve la URL

Al **leer**, nunca al escribir. `getPublicUrl` sigue devolviendo la referencia del
proxy y eso es lo que se persiste (invariante §3); `createAssetUrlResolver`
(`public-url.ts`) traduce la key a la URL del CDN en el momento de pintar. Cambiar
de dominio o de proveedor es cambiar una variable, no reescribir la tabla.

```
subida    tx.uploadMany("media", files)
          → buildObjectKey       → media/foto-1784006709346.jpg
          → bucketForKey         → bucket público
          → uploadFile(+ Cache-Control inmutable)
          → getPublicUrl         → /api/storage?key=…   (esto es lo que se guarda)

lectura   catálogo público: el navegador NO pregunta a nuestro servidor —
          assetUrlResolver(key) → https://cdn…/media/… al pintar
          proxy: bucketForKey(key) antes de getFile/getPresignedUrl
```

El proxy sigue sirviendo `media/` aunque el CDN esté activo: en entornos sin
dominio es la única vía, y las referencias persistidas siguen siendo válidas.

#### Prerrequisitos de despliegue (fuera del repo)

1. Dominio como zona activa en Cloudflare.
2. Segundo bucket R2 (`<proyecto>-public`).
3. R2 → bucket público → **Custom Domain**. El bucket privado no recibe dominio
   ni acceso `r2.dev`.
4. **Cache Rule**: Edge y Browser TTL "respect origin" — los objetos ya viajan con
   su `Cache-Control`.
5. Token R2 `Object Read & Write` scoped a **los dos** buckets. Sigue siendo un
   solo token: un proceso, una credencial.

CORS no hace falta: las imágenes se cargan con `<img>`, no con `fetch`.

> **Cambiar `CDN_PREFIXES` no es retroactivo.** Los objetos ya subidos se quedan
> en el bucket donde aterrizaron; si después se añade o quita un prefijo,
> `bucketForKey` los buscará en el bucket equivocado y devolverán 404. Mover un
> prefijo entre buckets es una **migración manual** (copiar objetos + verificar),
> no un cambio de constante.

### 7.3 CORS para el ZIP del gestor de nube

El gestor de nube ([cloud/00-gestor-nube.md](../cloud/00-gestor-nube.md)) arma los
ZIP **en el navegador**: pide URLs firmadas y hace `fetch` directo al bucket. Un
`fetch` entre orígenes exige CORS en **los dos** buckets. Solo lectura, sin
credenciales:

| Proveedor | Cómo |
|---|---|
| MinIO (local) | Permite todos los orígenes por defecto (`MINIO_API_CORS_ALLOW_ORIGIN`). Nada que hacer |
| Cloudflare R2 | Bucket → Settings → CORS Policy, en el privado **y** en el público: `[{"AllowedOrigins":["https://app.tudominio.com"],"AllowedMethods":["GET","HEAD"]}]` |
| AWS S3 | `aws s3api put-bucket-cors` con la misma regla |
| GCS | `gcloud storage buckets update gs://<bucket> --cors-file=cors.json` con `[{"origin":["https://app.tudominio.com"],"method":["GET","HEAD"],"maxAgeSeconds":3600}]` |

Sin CORS todo lo demás sigue funcionando (listar, descargar un archivo suelto,
borrar); solo el ZIP falla, y la pantalla lo explica. CORS de solo lectura no
expone nada: sin una URL firmada, el bucket privado sigue respondiendo 403.

## 8. Adaptadores y factory

Ambos adaptadores son **factories funcionales** que cierran sobre un cliente del
SDK y devuelven un objeto que cumple `IStorageProvider`. Reciben el **logger del
proyecto inyectado** (puerto `Logger`); todas las operaciones loguean con contexto
y re-lanzan, salvo donde la ausencia es un resultado válido.

**S3 (`s3.adapter.ts`)** — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`:

- `forcePathStyle` configurable (default `true`, necesario para MinIO/endpoints
  custom; **`false` en AWS real**).
- `createBucket` idempotente (ignora `BucketAlreadyOwnedByYou`/`BucketAlreadyExists`).
- `getFile` consume el stream a `Buffer.concat`.
- `fileExists` traduce `NotFound`/HTTP 404 a `false`; otros errores se re-lanzan.
- `getPresignedUrl` fija `Content-Disposition: inline` con el **filename saneado**
  (sin comillas/saltos de línea → evita inyección de headers).

**GCS (`gcs.adapter.ts`)** — `@google-cloud/storage`:

- Cadena de credenciales: **emulador** → **base64** → **keyfile** → **ADC**.
- Auto-inicializa el bucket por defecto **solo en modo emulador**.
- `getPresignedUrl` firma URL v4; en emulador devuelve la URL de descarga
  compatible con fake-gcs-server.

**Factory (`storage.factory.ts`)** — `createStorageProvider(config, logger)` (config
explícito, útil en tests) y `createStorageProviderFromEnv(env, logger)` (arma el
`StorageConfig` desde el env **ya validado**). Es el único punto que conoce ambos
adaptadores.

**DI** — el provider se construye **una vez a nivel de módulo** en
`container.server.ts` y se registra con `asValue` (como `logger`/`rateLimiter`).
Registrarlo con `asFunction` lo recrearía en cada petición (el contenedor Awilix
es por-petición) y con él el cliente del SDK.

## 9. Propiedades de seguridad (amenaza → defensa)

| Amenaza | Defensa |
|---|---|
| Enumeración/lectura de objetos ajenos por el proxy | Política por prefijo **fail-closed** + `requireAuth` en privados (`storage.policy.ts`) |
| Acoplamiento de la BD al proveedor | Se persiste la referencia proxy, no la URL del proveedor (`getPublicUrl`) |
| Exposición de credenciales del proveedor al cliente | Nunca se devuelven URLs del bucket directas; el proxy firma con TTL corto (300 s) |
| *Path traversal* / colisiones vía nombre de archivo | `buildObjectKey` sanitiza (`[^a-zA-Z0-9.-] → _`) + timestamp |
| Inyección de headers vía `Content-Disposition` | `filename` saneado en `getPresignedUrl` (S3) |
| Agotar RAM del server sirviendo archivos grandes inline | Cap de 15 MB en modo inline (`413`); por defecto se prefiere el redirect firmado |
| Subida de archivos abusivos (tipo/tamaño) | `validateUploadInput` (allowlist de tipos + límite de tamaño/conteo) **antes** de subir, integrado en la transacción (§5.4) |
| Huérfanos por fallo a medio camino (subida OK, BD falla) | Transacción compensatoria: `withStorageTransaction` revierte las subidas si el callback lanza (§5.4) |
| Misconfiguración de storage en producción | Fail-fast condicional al boot (§4): el proveedor seleccionado exige sus variables |
| Logs filtrando credenciales | Puerto `Logger` con redacción automática de claves sensibles |
| Exposición de prefijos privados por el dominio público | Bucket público **separado**: un Custom Domain expone el bucket entero, así que lo privado no vive en él. `env.server.ts` exige las dos variables juntas (§7.2) |
| Un prefijo con sesión servido por un dominio abierto | Invariante `CDN_PREFIXES ⊆ PUBLIC_PREFIXES`, testeado en `storage.policy.test.ts` |

**Límites conocidos (aceptados):**

- El modo `inline` hace pasar el archivo por nuestro servidor; úsalo solo para
  incrustar/ocultar del todo al proveedor. Para descargas grandes, prefiere la
  redirección firmada (default).
- El cap de inline se comprueba **después** de descargar el objeto del proveedor
  (el puerto no expone el tamaño sin bajarlo). La defensa primaria contra objetos
  grandes es la validación de tamaño en la **subida**.
- `getPresignedUrl` **no** comprueba existencia: firma siempre. Una key
  inexistente devuelve un redirect a una URL firmada que el proveedor resolverá
  como 404.
- Las URLs firmadas **rompen la caché del navegador**: la firma cambia en cada
  petición, así que la misma imagen se re-descarga en cada vista (§7.1). Es el
  precio de mantener el bucket privado con TTL corto.

## 10. Cómo replicarlo en otro proyecto (plantilla)

Qué se lleva tal cual (agnóstico): `storage.port.ts` (cero dependencias), los
adaptadores + factory (solo dependen del puerto, su SDK y un `logger`),
`storage.utils.ts`, `object-key.ts`, `mime.ts` y `storage.policy.ts`.

Qué se reescribe por stack (adaptadores):

1. **Proxy** (`routes/storage.route.ts`): es lo único atado al framework (aquí
   React Router). La lógica de negocio ya vive en el adaptador; el route solo
   traduce HTTP ↔ `getFile`/`getPresignedUrl`. Mantén el contrato de
   `getPublicUrl` (`/api/storage?key=...`) o cámbialo **de forma consistente** en
   `getPublicUrl` **y** `getKeyFromUrl` a la vez.
2. **Arranque/DI** (`container.*`, `env.server.ts`): registra el provider como
   **singleton de proceso**, no por petición. Añade las variables de storage a la
   validación de env con la exigencia condicional al proveedor.
3. **Consumidores**: sigue las convenciones — `key` con prefijo lógico + nombre
   sanitizado + timestamp; persiste la referencia de `getPublicUrl`; en
   reemplazos/borrados resuelve la key vieja con `getKeyFromUrl` y borra
   best-effort.

Puntos de variación previstos por proyecto: proveedor y credenciales por env,
`PUBLIC_PREFIXES` (política de visibilidad), allowlist de tipos y límite de tamaño
por consumidor, y la ruta del proxy si no se usa `/api/storage`.

## 11. Pendientes conocidos

- **Autorización fina por objeto:** hoy la política es por prefijo (público vs
  privado). Para "solo el dueño ve su documento" faltaría colgar una comprobación
  de propiedad de `requireAuth`/`requireRole` en el proxy.
- **Cap de inline pre-descarga:** medir el tamaño con un `HEAD`/metadata antes de
  bajar el objeto requeriría extender el puerto (`getFileMetadata`); hoy el cap se
  aplica tras descargar.
- **Limpieza de huérfanos:** resuelta. El camino de escritura lo cubre la
  transacción compensatoria (§5.4), y los huérfanos históricos se detectan y
  borran desde el gestor de nube, que cruza `listObjects` con las
  `IObjectReferenceSource` de cada módulo ([cloud/00-gestor-nube.md](../cloud/00-gestor-nube.md) §5).
  No es una rutina automática: la ejecuta un admin.
- **CDN en el panel de administración:** el catálogo de cursos disponibles ya
  resuelve sus portadas con `assetUrlResolver` (`enrollments`), pero el listado
  administrativo sigue usando la referencia del proxy. Va autenticado y son pocas
  filas, así que se dejó fuera a propósito; el resolutor ya está inyectado si
  algún día molesta.
- **Migración formal de Prisma:** el consumidor de ejemplo (`photoUrl`) se aplicó
  con `db push` (el flujo actual del proyecto, sin historial de migraciones).
