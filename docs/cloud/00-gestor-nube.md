# Gestor de archivos en la nube — Referencia

**Última actualización:** 2026-09-14 · Describe el módulo `app/modules/cloud` **como
está implementado**.

---

## 1. Qué es

`/dashboard/nube` (solo `SUPERADMIN`) enseña el almacenamiento de objetos como un
árbol de carpetas y permite:

- ver miniaturas, tamaño, fecha, visibilidad y **a quién pertenece** cada archivo;
- descargar un archivo o armar un **ZIP en el navegador** con una selección;
- **eliminar en cascada**: el archivo desaparece del bucket *y* de la ficha que lo
  usaba;
- **buscar huérfanos**: objetos que ninguna fila de la base referencia.

No sube, renombra ni mueve archivos: esas escrituras pertenecen a los módulos
dueños de los datos (hoy, usuarios).

## 2. Estructura

```
app/shared/storage/
├── storage.port.ts              + listObjects · deleteFiles · disposition
├── storage.listing.ts           collectObjects(): recorrido paginado con tope
└── object-reference.port.ts     IObjectReferenceSource: "¿quién usa esta key?"

app/modules/cloud/
├── domain/        cloud.config · cloud.errors · cloud.paths · cloud.rules
│                  cloud.service (ICloudService) · cloud.types
├── application/   cloud.service.server.ts
├── routes/nube/   index.loader · index.action · index.tsx
├── components/    path-bar · table · grid · selection-bar · object-sheet
│                  delete-dialog · orphans-sheet · thumb · badges
├── hooks/         use-zip-download · use-view-mode
└── utils/         cloud-intents · cloud-format · cloud-error-messages · to-cloud-rows

app/modules/users/infrastructure/user-photo.references.server.ts
app/modules/courses/infrastructure/course-cover.references.server.ts
```

**Regla de dependencias:** `cloud` no importa nada de `users`, de `courses` ni de
ningún otro módulo dueño de datos.
Cada módulo que guarda keys publica una `IObjectReferenceSource` y el composition
root (`container.server.ts`) las junta en `objectReferenceSources`. El puerto vive
en `shared/storage` para que los módulos que lo implementan no dependan de `cloud`.

## 3. Árbol unificado sobre dos buckets

La key decide el bucket (`bucketForKey`), así que el gestor usa la misma regla
al leer:

| Carpeta | Buckets que se consultan |
|---|---|
| raíz (`""`) | los dos |
| `media/…` (un `CDN_PREFIX`) | solo el público |
| cualquier otra | solo el de por defecto |

Los objetos que aparecen en un bucket que **no** es el suyo según la política se
descartan: el proxy no podría servirlos. Con dos buckets, el cursor que ve el
cliente es un JSON en base64url con el token de cada bucket
(`encodeCursor`/`decodeCursor`). Los tokens de S3 y GCS solo avanzan, por eso la
pantalla pagina con "Cargar más".

## 4. Borrado en cascada

```
previewDelete(selection)       → { objectCount, totalBytes, owners[] }   (no borra)
delete(selection, actor)
  1. expandir la selección      carpetas → todas sus keys (tope 2000; si pasa, se rechaza ENTERA)
  2. resolver referencias       una consulta IN por fuente, en bloques de 500
  3. source.release(keys)       PRIMERO la base. Si lanza, no se borra ningún objeto
  4. provider.deleteFiles       por bucket, best-effort; lo que falle queda huérfano
  5. logger.info("[cloud] borrado", { actorId, … })   — no hay tabla de auditoría
```

Qué suelta cada fuente:

- **Usuario** → `photoUrl = null` donde `photoUrl = toProxyRef(key)`.

Un módulo nuevo que guarde keys añade aquí su fuente; el gestor no cambia.

La UI pide escribir el nombre de la carpeta (o "eliminar" si son varias) antes
de borrar carpetas.

## 5. Huérfanos

Un objeto es huérfano si **ninguna fuente lo referencia y su `lastModified` tiene
más de 15 minutos**. La ventana existe porque `withStorageTransaction` sube antes
de escribir en la base: sin ella, un escaneo durante un guardado marcaría como
huérfanas las fotos que se están guardando. Un objeto sin fecha no se considera
huérfano. El escaneo recorre hasta 5000 objetos y avisa si se truncó.

El listado normal muestra "Sin uso" y no "Huérfano", porque no aplica la ventana.

## 6. ZIP en el navegador

```
navegador → POST intent=zip-manifest     servidor: expande, suma bytes (tope 2 GB), firma URLs (900 s)
          ← { fileName, totalBytes, entries: [{ path, url, size }] }
navegador → fetch(url) × N                directo al bucket: 0 bytes por el servidor
          → client-zip (streaming) → showSaveFilePicker (Chromium, a disco) | Blob (resto)
```

- El selector de guardado se abre **antes** de pedir el manifiesto: el navegador
  solo lo permite dentro del gesto del clic. Por eso el nombre sugerido se calcula
  también en el cliente (`suggestedZipName`).
- Progreso por bytes y cancelación con `AbortController`. Salir de la pantalla
  cancela la descarga.
- Las URLs viven 900 s y no 300: los archivos se piden uno a uno y las últimas
  caducarían en carpetas grandes. Un 403 a mitad se explica como caducidad.
- **Requiere CORS** en los buckets ([storage §7.3](../storage/00-sistema-almacenamiento.md)).
  Sin CORS, `fetch` falla con `TypeError` y el aviso lo dice. La descarga de un
  archivo suelto no necesita CORS: es una navegación a una URL firmada con
  `Content-Disposition: attachment`.

## 7. Límites (`domain/cloud.config.ts`)

| Constante | Valor | Por qué |
|---|---|---|
| `listPageSize` | 100 por bucket | página del listado |
| `folderOperationMaxObjects` | 2000 | borrado y ZIP cargan la lista en memoria |
| `zipMaxBytes` | 2 GB | Firefox/Safari arman el ZIP en memoria |
| `downloadUrlTtlS` / `zipUrlTtlS` | 300 s / 900 s | ver §6 |
| `orphanGraceMs` | 15 min | ver §5 |
| `orphanScanMaxObjects` | 5000 | tope del escaneo |
| `maxSelection` | 500 | keys + carpetas por petición |

## 8. Amenazas → defensas

| Amenaza | Defensa |
|---|---|
| Un no-superadmin lista o borra | `requireRole(["SUPERADMIN"])` en loader **y** action |
| Path traversal por la URL o el formulario | `cloud.rules.ts`: sin `/` inicial, `.`, `..`, segmentos vacíos ni caracteres de control |
| Borrar el bucket entero de un clic | la raíz no es seleccionable; carpetas exigen escribir su nombre |
| Borrado a medias de una carpeta enorme | la selección se rechaza entera si pasa del tope |
| Fichas con imágenes rotas | la base se suelta **antes** de borrar objetos; si falla, no se borra nada |
| Borrar una subida en curso como "huérfana" | ventana de gracia de 15 min |
| Revalidar el listado en cada consulta | `shouldRevalidate` solo revalida tras `delete` |

## 9. Añadir un módulo con archivos

1. Implementar `IObjectReferenceSource` en su `infrastructure/` (`findByKeys`,
   `release` transaccional, `describeFolders` para sus prefijos).
2. Añadirla al array `objectReferenceSources` de `container.server.ts`.

El gestor no cambia.
