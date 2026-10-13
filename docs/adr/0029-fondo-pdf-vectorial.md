# ADR 0029 · Fondo PDF: saneado por reconstrucción y composición vectorial

**Estado:** aceptado · 2026-10-02
**Extiende:** [ADR 0019](./0019-snapshot-del-diseno-y-puerto-de-exportacion.md) §2.1–2.2
(Chromium sin JS ni red) y [ADR 0028](./0028-editor-libre-documento-v2.md)

## 1. Contexto

Quien diseña el certificado en otra herramienta quiere subir ese PDF y colocar encima los
datos de cada persona, el QR y el folio. El archivo final debe conservar el PDF original
en calidad de imprenta.

## 2. Decisiones

### 2.1 Raster en el navegador, saneado en el servidor

1. El navegador carga `pdfjs-dist` solo al elegir el archivo y rasteriza la primera página
   a `rasterDpi = min(300, √(16 MP / área))` (tope de canvas de iOS), en WEBP o, si el
   navegador no lo codifica (Safari), en JPEG.
2. El servidor (`ICertificatePdfTools.sanitize`, adaptador `pdf-lib-tools.server.ts` con
   `@cantoo/pdf-lib`, fork mantenido de pdf-lib) **reconstruye** la página 1 en un
   documento nuevo con `embedPage` + `drawPage`. Así solo pasan su contenido y sus
   recursos: nada de JavaScript, acciones (`/AA`), anotaciones, formularios ni adjuntos.
   `copyPages` no sirve: copia el diccionario de la página entero.
3. Respeta `/Rotate` y el CropBox, igual que pdf.js, para que raster y vector coincidan.
4. Rechaza: no es PDF, cifrado, ilegible, más de 10 MB, más de 32 MiB descomprimidos (§2.3),
   lado fuera de 200–1191 pt (A7–A3), o un raster que no mide página × dpi / 72 (±2 px).
5. Guarda el PDF reconstruido (nunca el original) y el raster en
   `documentos/certificados/<curso>/fondos/`, privados. La página adopta el tamaño del PDF.

### 2.2 Dos salidas del mismo diseño

| Salida | Cómo |
| --- | --- |
| Vista previa y PNG | El raster como `<img>` de fondo, en el mismo HTML |
| PDF | Chromium imprime solo los elementos (`mode: "overlay"`, `omitBackground`) y `overlay` estampa esa página sobre el PDF reconstruido, anclada arriba a la izquierda |

Chromium redondea el tamaño de página a su rejilla (unas centésimas de punto); por eso la
capa se ancla a su tamaño natural en vez de estirarla.

### 2.3 Saneado aislado y acotado (remediación C02/C03, 10-10-2026)

Un PDF de unos cientos de bytes podía inflarse a decenas de MB al cargarlo (`/ObjStm` con
Flate encadenado) o al copiar la página (`/Contents` repetido), y pdf-lib lo descomprime de
forma síncrona: el único proceso web quedaba bloqueado segundos. Ahora:

1. `sanitize` corre en un `worker_thread` nuevo por subida
   (`pdf-sanitize.worker.server.ts`), con 256 MB de heap, 10 s de plazo y como mucho dos a la
   vez; el resto espera turno. Plazo vencido o heap agotado → `too_large`.
2. Dentro del worker, `DecodeStream.ensureBuffer` lleva un presupuesto de **32 MiB
   descomprimidos entre todos los flujos**: es el único punto por el que crece la salida de
   cualquier filtro, en la carga y en `embedPage`. Cuenta lo más alto que pide cada flujo
   (no la capacidad del búfer, que crece al doble). Como el parser se traga la excepción y
   guarda el objeto como inválido, el rechazo sale de una bandera comprobada al final.
3. Un fallo del worker que no es plazo ni heap (por ejemplo, que no esté en el build) no es
   un PDF malo: sale como error inesperado.
4. En producción el worker es `build/worker/pdf-sanitize.js`, que construye
   `vite.worker.config.ts` junto al worker de colas y se resuelve desde el directorio de
   arranque. En desarrollo y en pruebas Node ejecuta el fuente quitando los tipos: hace
   falta Node 22.18 o posterior.

Arrancar el worker cuesta unos 0,8 s por subida (cargar pdf-lib en un hilo nuevo); a cambio
el resto de las peticiones no espera.

## 3. Consecuencias

- Puerto nuevo `certificatePdfTools` (de proceso, `asValue`); recibe la URL del worker de
  saneado desde el composition root (§2.3).
- `pdfjs-dist` es dependencia de desarrollo: solo la usa el bundle del cliente.
- Una página sin contenido es un fondo en blanco válido.
- El raster y el vector difieren solo en el antialiasing de pdf.js.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Rasterizar el PDF a 300 ppp para todo | Pierde el vector y pesa más |
| Rasterizar en el servidor | Exige un canvas nativo (`@napi-rs/canvas`) en la imagen Alpine o JS en Chromium |
| Guardar el PDF original | Puede traer JavaScript, enlaces y formularios |
