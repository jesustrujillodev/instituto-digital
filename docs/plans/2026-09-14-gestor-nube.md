# Gestor de archivos en la nube (cloud-admin) + carpetas por vehículo

> **Nota (2026-09-15).** Plan histórico. Las partes que tocan el módulo de
> inventario y las carpetas por vehículo ya no aplican: ese módulo se eliminó
> al reconvertir el repo en el Instituto Digital de Capacitación. El gestor de
> nube sigue vigente, con `media/` en lugar de `catalog/` y una sola fuente de
> referencias (usuarios).

## Contexto

`checklist.md:6` tiene pendiente el **gestor de archivos en la nube**. Hoy los
objetos solo se ven desde la consola del proveedor (R2/MinIO/GCS). No hay forma de
revisar, descargar ni limpiar lo que hay en el bucket desde el panel.

Además, el inventario sube todo **a la raíz del prefijo**:
`catalog/<nombre>-<ts>.jpg` y `vehicle-documents/<nombre>-<ts>.pdf`
(`vehicle.service.server.ts:213-220`). Con decenas de vehículos esa raíz no se
puede navegar.

**Objetivo:** una pantalla `/dashboard/nube` (solo ADMIN) para navegar el
almacenamiento por carpetas, ver metadatos y vista previa, saber a qué pertenece
cada archivo, descargar archivos o carpetas (ZIP), eliminar (con cascada a la BD)
y detectar huérfanos. Las subidas nuevas del inventario van a una carpeta con el
slug del vehículo.

### Decisiones tomadas con el usuario (2026-09-14)

| Tema | Decisión |
|---|---|
| Estructura | `catalog/<slug>/…` (fotos) y `vehicle-documents/<slug>/…` (documentos). La política por prefijo, el bucket público/CDN y la privacidad del expediente **no cambian** |
| Borrar un archivo en uso | **Cascada a la BD**: se borra el `VehicleAsset` (y se recalculan portada y scores) o se limpia `User.photoUrl`. Nunca quedan referencias rotas |
| Archivos actuales en la raíz | **Datos de prueba**: no hay migración. El detector de huérfanos sirve para limpiarlos |
| Descarga de carpetas | **ZIP armado en el navegador** con URLs firmadas: cero bytes por el servidor. Requiere CORS en los buckets |
| Alcance extra | Vista previa y metadatos · detección de huérfanos · selección múltiple. **Sin** subida desde el gestor |
| Vista con dos buckets | **Árbol unificado**: una raíz con etiqueta Público/Privado; el bucket es un detalle interno, lo decide la key |

Fuera de alcance: subir, renombrar o mover desde el gestor; carpeta por usuario
para `profile-photos/`; Workers/Lambdas.

---

## Fase 1 — Carpeta por slug en el inventario

El slug se fija en el alta y nunca se regenera
(`vehicle.repository.server.ts:98-106`), así que es un nombre de carpeta estable.

1. **`app/modules/inventory/domain/vehicle.config.ts`**: añadir
   `vehicleAssetFolder(prefix: string, slug: string): string` → `${prefix}/${slug}`.
   Valida el slug con el patrón `^[a-z0-9]+(?:-[a-z0-9]+)*$` (el mismo que
   `showroom/utils/compare-selection.ts:17`; mover a una constante compartida en
   `app/lib/string-utils.ts` junto a `toSlug`) y lanza si no casa. Así un slug
   corrupto no puede meter `..` ni `/` en la key.
2. **`domain/vehicle.repository.ts` + `infrastructure/vehicle.repository.server.ts`**:
   `findSlug(documentId): Promise<string | null>` (`select: { slug: true }`).
3. **`application/vehicle.service.server.ts` → `syncAssets`**: antes de la
   transacción, `const slug = await vehicleRepository.findSlug(documentId)`; si es
   `null` → `VehicleNotFoundError`. Pasar
   `vehicleAssetFolder(VEHICLE_PHOTO.prefix, slug)` y
   `vehicleAssetFolder(VEHICLE_DOCUMENT.prefix, slug)` a `tx.uploadMany`. No hace
   falta tocar `buildObjectKey` (el prefijo ya admite `/`), ni `bucketForKey`,
   `isPublicKey` o `cacheControlForKey` (comparan con `startsWith`), ni el showroom
   (`public-url.ts` ya codifica la key por segmentos).
4. **Tests**
   - `application/__tests__/vehicle.service.server.test.ts`: las keys subidas
     empiezan por `catalog/<slug>/` y `vehicle-documents/<slug>/`; un vehículo
     inexistente no sube nada.
   - `shared/storage/__tests__/storage.policy.test.ts`: `catalog/slug/x.jpg` es
     público/CDN; `vehicle-documents/slug/x.pdf` es privado y va al bucket por
     defecto.
   - `domain/__tests__`: `vehicleAssetFolder` rechaza `../x`, `a/b` y `""`.
5. **Docs**: tabla de `docs/inventory/00-inventario.md:110-111` y convención de key
   en `docs/storage/00-sistema-almacenamiento.md` §3.

## Fase 2 — Extender el puerto de storage

`listFiles` solo devuelve keys: sin tamaño, fecha, carpetas ni paginación. S3 corta
en 1000 y GCS añade `/` al prefijo (`gcs.adapter.ts:145`), que no es lo que hace
S3. Se **añaden** métodos y los actuales no cambian.

**`app/shared/storage/storage.port.ts`**

```ts
export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date | null;
  contentType?: string;
}

export interface ListObjectsOptions {
  prefix?: string;       // crudo, sin normalizar: igual en S3 y GCS
  delimiter?: "/";       // presente = listado de UN nivel (carpetas + objetos)
  cursor?: string | null;
  limit?: number;        // tope 1000
}

export interface ListObjectsResult {
  folders: string[];     // prefijos completos acabados en "/"
  objects: StorageObject[];
  nextCursor: string | null;
}

listObjects(bucket, options): Promise<ListObjectsResult>;
deleteFiles(bucket, keys: string[]): Promise<{ deleted: string[]; failed: { key: string; error: string }[] }>;
getPresignedUrl(bucket, key, expiresInSeconds?, options?: { disposition?: "inline" | "attachment" }): Promise<string>;
```

- **S3** (`s3.adapter.ts`): `ListObjectsV2Command` con `Delimiter`, `MaxKeys` y
  `ContinuationToken` → `CommonPrefixes` / `Contents` (`Size`, `LastModified`).
  `DeleteObjectsCommand` en lotes de 1000, leyendo `Errors[]`.
  `ResponseContentDisposition` según `disposition`, conservando
  `safeHeaderFilename`.
- **GCS** (`gcs.adapter.ts`): `bucket.getFiles({ prefix, delimiter, maxResults,
  pageToken, autoPaginate: false })` → `[files, nextQuery, apiResponse.prefixes]`.
  `deleteFiles` con `Promise.allSettled`. `getSignedUrl({ responseDisposition })`.
- **Nuevo `app/shared/storage/storage.listing.ts`**:
  `collectObjects(provider, bucket, prefix, { maxObjects })`. Recorre páginas sin
  delimitador y devuelve `{ objects, truncated }`. Lo usan el borrado de carpetas,
  el ZIP y el escáner de huérfanos.
- **Tests**: los adaptadores con el cliente del SDK mockeado (mismo estilo que
  `storage.factory.test.ts`), y `collectObjects` con un provider falso (paginación
  y tope).

## Fase 3 — Módulo `cloud` (dominio, aplicación, infraestructura)

Estructura igual que `inventory`/`users`: `app/modules/cloud/{domain,application,infrastructure,routes,components,hooks,utils}`.

### 3.1 Dominio

- **`domain/cloud.config.ts`**: límites en un solo lugar.
  `LIST_PAGE_SIZE = 100` · `FOLDER_OPERATION_MAX_OBJECTS = 2000` ·
  `ZIP_MAX_BYTES = 2 GB` · `DOWNLOAD_URL_TTL_S = 300` · `ZIP_URL_TTL_S = 900`
  (`client-zip` baja los archivos uno a uno y una firma de 300 s caducaría en
  carpetas grandes) · `ORPHAN_GRACE_MS = 15 min` · `ORPHAN_SCAN_MAX_OBJECTS = 5000`.
  También las etiquetas legibles de los prefijos raíz: `catalog` → "Fotos de
  vehículos", `vehicle-documents` → "Documentos de vehículos",
  `profile-photos` → "Fotos de perfil".
- **`domain/cloud.types.ts`**: `CloudFolder`, `CloudObject` (con `visibility:
  "public" | "private"` desde `isPublicKey` y `reference: ObjectReference | null`),
  `CloudListing`, `DeleteImpact` y `ZipManifest`.
- **`domain/cloud.rules.ts`** (valibot): `pathRule` y `keyRule`. Sin `..`, sin `/`
  inicial, sin `//`, sin caracteres de control, máximo 1024. Las carpetas acaban en
  `/`. Lotes de hasta 500 keys/carpetas por petición. La raíz `""` **no** se puede
  borrar ni descargar entera.
- **`domain/object-reference.port.ts`**: cómo sabe el gestor a quién pertenece un
  archivo sin importar internals de otros módulos.

  ```ts
  export interface ObjectReference {
    key: string;
    owner: "vehicle" | "user";
    label: string;   // "Toyota Corolla LE 2021 · Foto"
    href?: string;   // "/dashboard/inventario/<documentId>/editar"
  }
  export interface IObjectReferenceSource {
    findByKeys(keys: readonly string[]): Promise<ObjectReference[]>;
    /** Suelta las referencias en la BD (cascada). Transaccional por dueño. */
    release(keys: readonly string[]): Promise<void>;
  }
  ```

- **`domain/cloud.errors.ts`**: `CloudNotConfiguredError`, `InvalidCloudPathError`,
  `FolderTooLargeError` y `ZipTooLargeError`, con sus mensajes en
  `utils/cloud-error-messages.ts` (contrato §25 de `docs/reglas.md`).
- **`domain/cloud.service.ts`**: interfaz `ICloudService`.

### 3.2 Fuentes de referencias (cada módulo publica la suya)

- **`inventory/infrastructure/vehicle-asset.references.server.ts`**
  - `findByKeys`: `vehicleAsset.findMany({ where: { key: { in } } })` con
    marca/modelo/año/`documentId` del vehículo → label y `href` de edición.
  - `release`: delega en un método nuevo del repositorio,
    **`vehicleRepository.removeAssetsByKeys(keys)`**. Agrupa por vehículo y, dentro
    de un `prisma.$transaction` por vehículo, repite lo que ya hace `syncAssets`
    (`vehicle.repository.server.ts:238-306`): soltar la portada, `deleteMany`,
    volver a fijar portada a la primera foto restante por `sortOrder` y
    `applyVehicleScores`. Así el orden del catálogo sigue siendo correcto tras
    borrar desde el gestor.
- **`users/infrastructure/user-photo.references.server.ts`**
  - `findByKeys`: `user.findMany({ where: { photoUrl: { in: keys.map(toProxyRef) } } })`.
    `toProxyRef` (`public-url.ts:14`) produce exactamente lo que persiste
    `getPublicUrl`.
  - `release`: `updateMany` → `photoUrl: null`.
- **DI**: `ICradle.objectReferenceSources: IObjectReferenceSource[]` en
  `shared/di/container.types.ts` y `container.server.ts`. El composition root las
  junta, así que `cloud` solo conoce el puerto. `Brand.logoUrl` es texto libre y no
  referencia storage, así que no necesita fuente.

### 3.3 Aplicación — `application/cloud.service.server.ts`

Dependencias: `storageProvider`, `storageBucket`, `storagePublicBucket`,
`objectReferenceSources`, `assetUrlResolver`, `logger`. Usa `createOperationRunner`
como `vehicle.service.server.ts:54`.

- **`list(path, cursor)`**: árbol unificado.
  - Qué buckets puede alojar el `path`: si empieza por un `CDN_PREFIX` y hay bucket
    público, solo el público. Si es la raíz o un prefijo que no es de CDN, los dos.
  - Lista con `delimiter: "/"`, fusiona carpetas (deduplicadas) y **descarta los
    objetos cuyo `bucketForKey(key)` no sea el bucket donde se encontraron** (el
    proxy no los podría servir). El cursor compuesto `{ default, public }` va en
    base64url.
  - Resuelve referencias de la página con todas las fuentes en paralelo (una
    consulta `IN` por fuente).
  - `previewUrl = assetUrlResolver(key)` solo para imágenes. Lo privado cae en el
    proxy, que exige sesión.
  - En `catalog/<slug>/` y `vehicle-documents/<slug>/` la carpeta muestra el nombre
    del vehículo, con la misma consulta de referencias sobre un archivo de muestra
    o una búsqueda por slug.
- **`downloadUrl(key)`**: `getPresignedUrl(bucketForKey(key), key,
  DOWNLOAD_URL_TTL_S, { disposition: "attachment" })`.
- **`zipManifest({ keys, prefixes })`**: expande carpetas con `collectObjects`
  (tope `FOLDER_OPERATION_MAX_OBJECTS`). Si pasa del tope o de `ZIP_MAX_BYTES` →
  error tipado, sin firmar nada. Devuelve `{ fileName, totalBytes, entries: [{ path,
  url, size }] }`, con `path` relativo a la carpeta seleccionada y URLs firmadas a
  `ZIP_URL_TTL_S`.
- **`previewDelete({ keys, prefixes })`**: expande y resuelve referencias. Devuelve
  `{ objectCount, bytes, vehicles: [{ label, count }], users: n }`. La UI lo muestra
  antes de confirmar.
- **`delete({ keys, prefixes })`**: el orden importa, y es el mismo criterio que
  `vehicle.service.server.ts:238-241`.
  1. Expandir y resolver referencias.
  2. `release` en cada fuente: **primero la BD**, en transacción.
  3. `deleteFiles` agrupado por bucket, best-effort. Lo que falle queda como
     huérfano y el escáner lo encuentra después. Nunca una referencia rota.
  4. `logger.info("[cloud] borrado", { actorId, count, prefixes })`. No hay tabla de
     auditoría; el `actorId` sale de `authPayload`.
  Devuelve `{ deleted, failed, releasedReferences }`.
- **`scanOrphans(prefix)`**: `collectObjects` (tope `ORPHAN_SCAN_MAX_OBJECTS`),
  resolución de referencias en bloques de 500. Es huérfano un objeto **sin
  referencia y con `lastModified` de hace más de `ORPHAN_GRACE_MS`**. La ventana es
  necesaria: `withStorageTransaction` sube **antes** de escribir en la BD, y sin
  ella un escaneo durante un guardado marcaría esas subidas como huérfanas. Borrar
  los huérfanos usa `delete` con sus keys.
- **Tests** (`application/__tests__/cloud.service.server.test.ts`, vitest, con
  provider y fuentes falsos):
  - fusión de dos buckets y descarte de objetos en el bucket equivocado;
  - cursor compuesto;
  - cascada antes del borrado de objetos, y si `release` lanza no se borra nada;
  - topes del ZIP;
  - ventana de gracia de huérfanos;
  - rechazo de la raíz y de `..`.
- **Tests de las fuentes**: `removeAssetsByKeys` vuelve a fijar la portada y
  recalcula scores. `user-photo` compara con `toProxyRef`.

## Fase 4 — UI `/dashboard/nube`

> **Obligatorio: la UI se produce con la skill `impeccable`.** Antes de escribir
> los componentes se invoca `/impeccable` para dar forma a la pantalla (jerarquía,
> estados vacío/carga/error, selección, diálogos destructivos, microcopy y
> responsive), tomando como referencia los componentes y tokens del panel
> (`DataTable`, `PageHeader`, sheets, tema activo) y `AUDITORIA-IMPECCABLE.md`.
> Al terminar se pasa otra vez `impeccable` en modo crítica/pulido sobre la
> pantalla real. El objetivo es una UI/UX coherente con el resto del dashboard y
> **sin slop**: nada de tarjetas decorativas genéricas, gradientes, iconos de
> relleno ni textos de plantilla. La lista de componentes de abajo es la
> estructura funcional; lo visual lo decide ese pase.

- **Rutas**: `app/modules/cloud/routes/routes.config.ts` →
  `route("nube", "modules/cloud/routes/nube/index.tsx")` con `index.loader.ts` e
  `index.action.ts`, registradas en la ZONA 3 de `app/routes.ts:48-54`.
  `requireRole(request, context, ["ADMIN"])` en loader **y** action. Breadcrumb con
  `handle.breadcrumb` como `inventario/index.tsx:65`.
- **Loader** `GET ?path=catalog/toyota-corolla-le-2021/&cursor=…`: la ruta vive en
  la URL, así que atrás/adelante y los enlaces funcionan. Sin storage configurado
  pinta un estado vacío (`ui/empty.tsx`) en vez de un 500.
- **Action** con `INTENT_FIELD` (patrón de `parse-vehicle-form-data.ts`): intents
  `download`, `zip-manifest`, `delete-preview`, `delete` y `scan-orphans`. Toasts
  con `useFetcherToast`.
- **Navegación**: ítem "Nube" (icono `Cloud`, `roles: ["ADMIN"]`) en
  `shared/layout/navigation.config.ts`, después de "Inventario".
- **Componentes** (`modules/cloud/components/`):
  - `cloud-path-bar.tsx`: migas de la carpeta actual, con las etiquetas legibles de
    `cloud.config.ts`.
  - `cloud-table.tsx`: `DataTable` con `showCheckbox`/`selectedRowIds` (ya
    soportado, `data-table.tsx:116-118`). Primero carpetas y después archivos.
    Columnas: nombre (miniatura `loading="lazy"` o icono por tipo), tamaño,
    modificado, visibilidad (badge Público/Privado), uso (enlace a la ficha del
    vehículo o al usuario, o badge "Huérfano"). Acciones por fila: ver, descargar,
    eliminar. Paginación con "Cargar más" porque los tokens de S3/GCS solo avanzan.
  - `cloud-selection-bar.tsx`: aparece con selección y ofrece "Descargar ZIP" y
    "Eliminar".
  - `cloud-object-sheet.tsx`: vista previa (imagen grande o enlace al PDF), key
    completa, metadatos y referencia.
  - `cloud-delete-dialog.tsx`: primero pide `delete-preview` y muestra "Se
    eliminarán N archivos (X MB). K pertenecen a 2 vehículos y 1 usuario: se
    quitarán de sus fichas". Al borrar **carpetas** hay que escribir el nombre de la
    carpeta. Reutiliza `ConfirmDialog`/`alert-dialog`.
  - `cloud-orphans-sheet.tsx`: "Buscar huérfanos" en la carpeta actual; lista,
    selección y "Eliminar huérfanos". Avisa si el escaneo se truncó.
- **Tests**: loader y action como en `inventario/__tests__/index.*.test.ts`
  (403 sin ADMIN, validación de intents, envelope de respuesta). Utilidades puras
  en `utils/__tests__`: formato de tamaño, etiquetas de carpeta y cursor.

## Fase 5 — Descarga ZIP en el navegador

- **Dependencia**: `client-zip`, con streaming y ~3 KB. `bun add client-zip`.
- **`modules/cloud/hooks/use-zip-download.ts`**:
  1. `fetcher.submit({ intent: "zip-manifest", … })` → `ZipManifest`.
  2. `downloadZip(entries.map(e => ({ name: e.path, input: () => fetch(e.url) })))`.
     Se usa un generador async para que cada `fetch` ocurra al consumirlo y no todos
     a la vez.
  3. Guardar: si existe `window.showSaveFilePicker` (Chromium), se hace `pipeTo` al
     archivo y no pasa por RAM. Si no, `response.blob()` y un enlace temporal (en
     Firefox/Safari cabe en memoria; por eso existe `ZIP_MAX_BYTES`).
  4. Progreso (bytes bajados / `totalBytes`) y cancelación con `AbortController`.
  5. Si un `fetch` lanza `TypeError` (casi siempre falta CORS), el toast lo explica
     y remite a la sección de CORS de la doc.
- La descarga de **un** archivo no necesita CORS: `download` devuelve la URL
  firmada con `attachment` y se navega a ella.
- **CORS** (solo `GET`/`HEAD` desde el origen de la app, sin credenciales):
  - MinIO local: permite todos los orígenes por defecto (`MINIO_API_CORS_ALLOW_ORIGIN`),
    no hay que tocar `compose.yml`. Se comprueba en la verificación.
  - R2: política CORS en **los dos** buckets (`AllowedOrigins: [<origen app>]`,
    `AllowedMethods: [GET, HEAD]`).
  - GCS: `gcloud storage buckets update gs://<bucket> --cors-file=cors.json`.
  - Se documenta en `docs/storage/00-sistema-almacenamiento.md` (nuevo §7.3) y en
    `.env.example` como prerrequisito de despliegue.

## Fase 6 — Documentación y cierre

- `docs/storage/00-sistema-almacenamiento.md`: métodos nuevos del puerto (§1, §8),
  convención de key con carpeta (§3), CORS (§7.3). En §11, marcar como resuelto el
  barrido de huérfanos.
- Nuevo `docs/cloud/00-gestor-nube.md`: flujos de listado, borrado en cascada, ZIP
  y huérfanos, con límites y amenazas → defensas.
- `docs/inventory/00-inventario.md`: prefijos con `<slug>/`.
- `checklist.md:6`: marcar `[x]` al terminar.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `app/shared/storage/storage.port.ts`, `s3.adapter.ts`, `gcs.adapter.ts` | `listObjects`, `deleteFiles`, `disposition` |
| `app/shared/storage/storage.listing.ts` | nuevo: `collectObjects` |
| `app/modules/inventory/domain/vehicle.config.ts` | `vehicleAssetFolder` |
| `app/modules/inventory/application/vehicle.service.server.ts` | `syncAssets` sube a `<prefijo>/<slug>/` |
| `app/modules/inventory/infrastructure/vehicle.repository.server.ts` | `findSlug`, `removeAssetsByKeys` |
| `app/modules/inventory/infrastructure/vehicle-asset.references.server.ts` | nuevo |
| `app/modules/users/infrastructure/user-photo.references.server.ts` | nuevo |
| `app/modules/cloud/**` | módulo nuevo |
| `app/shared/di/container.types.ts`, `container.server.ts` | `cloudService`, `objectReferenceSources` |
| `app/routes.ts`, `app/shared/layout/navigation.config.ts` | ruta y menú |

Reutilizar: `bucketForKey`/`isPublicKey`/`isCdnKey` (`storage.policy.ts`),
`toProxyRef`/`createAssetUrlResolver` (`public-url.ts`), `contentTypeForKey`
(`mime.ts`), `createOperationRunner`, `requireRole`, `DataTable`, `ConfirmDialog`,
`PageHeader`, `useFetcherToast`, `BreadcrumbHandle`.

## Verificación

1. `bun run typecheck` y `bun run test` (vitest; nada de `bun:test`).
2. Local: `docker compose up -d` (Postgres + MinIO con los dos buckets) y
   `bun run dev`. **No** usar `prisma migrate dev`: no hay cambios de esquema en
   este plan.
3. Inventario: crear un vehículo con 3 fotos y 1 PDF → en la consola de MinIO
   (`:9001`) aparecen en `car-dealership-public/catalog/<slug>/` y
   `car-dealership-storage/vehicle-documents/<slug>/`. La ficha pública
   `/catalogo/<slug>` pinta las fotos.
4. `/dashboard/nube` como ADMIN:
   - La raíz muestra las tres carpetas con su etiqueta Público/Privado.
   - Entrar en `catalog/<slug>/` muestra miniaturas y "Uso: Toyota…".
   - Un usuario sin ADMIN recibe 403 en loader y action.
5. Descargar un archivo suelto con extensión correcta, y un ZIP de
   `vehicle-documents/<slug>/` y de una selección mixta: se abre y trae la
   estructura esperada. En DevTools → Network no hay bytes contra el servidor de la
   app, solo contra `:9000`.
6. Borrar una foto que es portada: desaparece del bucket, la ficha de edición
   muestra otra portada y el catálogo no pinta imágenes rotas. Borrar la carpeta
   `catalog/<slug>/` pide escribir el nombre y el vehículo queda sin fotos.
7. Huérfanos: los archivos de prueba en la raíz de `catalog/` salen como huérfanos;
   uno subido hace menos de 15 min no aparece. "Eliminar huérfanos" los borra.
8. Con `STORAGE_PUBLIC_BUCKET_NAME` vacío (modo un bucket), el árbol unificado se
   ve igual.
9. UI/UX: pase final de `/impeccable` (crítica + pulido) sobre `/dashboard/nube` en
   claro y oscuro, escritorio y ~400 px. Sin hallazgos de slop pendientes y
   coherente con Inventario y Usuarios.

---

## Estado: implementado (2026-09-14)

Referencia de lo construido: [docs/cloud/00-gestor-nube.md](../cloud/00-gestor-nube.md).

### Desviaciones respecto al plan

| Plan | Implementado | Por qué |
|---|---|---|
| `IObjectReferenceSource` en `modules/cloud/domain` | En `app/shared/storage/object-reference.port.ts` | Inventario y usuarios lo implementan: en `cloud` los habría hecho depender del gestor |
| Etiquetas de carpetas raíz en `cloud.config.ts` | Las aporta cada fuente con `describeFolders` | `cloud` no importa nada de otros módulos |
| `ObjectReference.label` con el papel del archivo | `label` (dueño) + `detail` (papel) | El resumen de borrado agrupa por vehículo, no por foto/documento |
| Badge "Huérfano" en el listado | "Sin uso" en el listado; "Huérfanos" solo en el escaneo | El listado no aplica la ventana de gracia |
| — | `CloudListing.trail` con nombres legibles | Las migas enseñan "Fotos de vehículos / Toyota…" y no la ruta cruda |
| — | Prop `summary` en `DataTable` y `min-w-0` en sus tarjetas móviles | El pie "de N resultados" mentía con paginación por cursor; los nombres largos desbordaban la tarjeta |
| Pase final con el agente `impeccable-finish-reviewer` | Revisión en el hilo: 2 rondas de capturas (escritorio y 400 px) y detector con 0 hallazgos | El agente no está disponible en este entorno |
