# ADR 0019 · Snapshot del diseño en la emisión y puerto de exportación

**Estado:** aceptado · 2026-09-23
**Contexto del cambio:** MVP-02 · F-09, emisión, folio y descarga; cierra D-01
**Extiende:** [ADR-0017](./0017-certificado-html-y-un-solo-renderizador.md) (el
renderizador) y [ADR-0018](./0018-diseno-del-certificado-borrador-y-publicado.md) (el
diseño publicado)

## 1. Contexto

Un certificado emitido es un documento institucional: si alguien lo baja en enero y otra
vez en marzo, tiene que ser el mismo. F-08 dejó un diseño editable por curso y un
renderizador HTML. Faltaban cuatro cosas:

- cuándo se emite y a quién;
- cómo se numera;
- qué se congela;
- con qué se convierte en PDF y PNG.

Esta última era la decisión D-01.

## 2. Decisiones

### 2.1 D-01: Chromium propio detrás de un puerto

`ICertificateExporter` (`domain/certificate.exporter.ts`) recibe HTML ya autocontenido y
devuelve bytes. El adaptador, `chromium-exporter.server.ts`, usa `puppeteer-core` con el
Chromium del sistema:

- en la imagen, `apk add chromium ttf-liberation`;
- en desarrollo, el Chrome instalado, vía `CHROMIUM_PATH`.

Se eligió sobre un servicio externo porque no suma credencial, ni costo por documento, ni
dependencia de terceros en la ruta de descarga, y funciona igual en desarrollo. El costo:

- La imagen crece unos 800 MB sin comprimir.
- Cada exportación pide memoria a Chromium. Se probó dentro de la imagen con
  `--memory=512m`.

Cambiar de motor es escribir otro adaptador; ninguna plantilla se entera.

### 2.2 El documento a exportar va autocontenido, y el navegador sin red ni JavaScript

Las firmas son privadas (ADR-0018 §2.5) y un Chromium de servidor no tiene sesión. En vez de
darle credenciales o URLs firmadas, el servidor lee las firmas con `storageProvider.getFile`,
las fuentes y el logo del disco, y los entrega como data URIs (`CertificateRenderOptions.assets`).

Con el documento completo, la página puede cerrarse del todo:

- `setJavaScriptEnabled(false)`;
- interceptación que aborta cualquier petición que no sea `data:`.

Aunque un texto escapara del saneado del renderizador, el HTML no podría pedir nada al
servidor ni a la red interna (sin SSRF). Por eso `--no-sandbox` dentro del contenedor es
aceptable: la página no ejecuta nada ni sale a ningún lado.

### 2.3 Se congelan el diseño Y los datos

La ficha pedía `designSnapshot`. Se congelan también los datos (`data_snapshot`): nombre
impreso, título, descripción, dependencia, horas, fecha y folio, ya formateados. Solo con el
diseño, renombrar el curso o corregir sus horas cambiaría un certificado ya entregado. Es el
mismo criterio con el que `Credit` congela la dependencia y el ejercicio.

Los dos se leen con tolerancia distinta:

- **Diseño ilegible:** cae al de por defecto y queda en el log, como en el editor.
- **Datos ilegibles:** lanzan error. Son a quién y por qué se otorgó, y no hay con qué
  sustituirlos.

### 2.4 Emitir es parte de `completionSync`

No hay un segundo «quién completó». `completionSync.sync` ya corre, en transacción y con la
fila del curso bloqueada, en cada escritura que decide el completado:

- el cierre;
- la corrección;
- el avance por lección;
- el examen.

Ahí mismo, junto al diff de créditos, llama a `certificateIssuance.sync` con **todos** los
que completaron. Consecuencias:

- **Revocar el crédito revoca el certificado.** Son el mismo diff sobre el mismo hecho.
  Restaurar lo devuelve con **su folio y sus snapshots**: es el mismo documento.
- **Emitir es idempotente** por `(courseId, userId)`. Volver a sincronizar no crea nada.
- **Los externos reciben certificado.** El crédito es de la dependencia; el certificado, de
  la persona.
- **Sin diseño publicado se emite con el de por defecto.** Nadie se queda sin certificado
  porque el capacitador no llegó a diseñarlo.

«Emitir certificados» en la impartición vuelve a sincronizar un curso finalizado antes de que
existiera esta feature.

### 2.5 `{seq}` global y sin reinicio

Con un consecutivo por curso o por año, dos cursos con el formato por defecto
`{year}-{seq}` producirían el mismo folio. El contador es una fila
(`certificate_folio_counter`) que se incrementa con `UPDATE … RETURNING` dentro de la
transacción de emisión. Eso tiene tres efectos:

- serializa las emisiones concurrentes;
- no deja huecos si la transacción revierte;
- da números únicos a cualquier formato que incluya `{seq}`.

El formato ahora **exige** `{seq}`. `folio` es `@unique` como última defensa.

### 2.6 Se genera en cada descarga

No hay `storageKey`: el archivo se dibuja cada vez desde los snapshots. Así no hay objetos
que invalidar al revocar o restaurar, ni huérfanos, ni una segunda fuente de verdad. Si la
carga lo pide, F-11 puede añadir caché sin cambiar el modelo.

### 2.7 El diseño nunca viaja desde el navegador

Las dos descargas son `GET` con identificador, versión y formato. El esquema de frontera
descarta cualquier otro campo, y una prueba lo confirma. La muestra del editor exporta lo
**guardado**, igual que «Publicar» publica lo guardado.

### 2.8 Una firma que imprime una emisión no se borra

La fuente de referencias cuenta también las firmas de los snapshots emitidos. `release`
lanza `STORAGE_OBJECT_LOCKED` antes de soltar nada, así que el gestor de nube no borra la
imagen: el certificado ya entregado no puede quedarse sin firma.

## 3. Consecuencias

- **Esquema:** `org.certificate_issues` y `org.certificate_folio_counter`; `User.certificates`
  y `Course.certificateIssues`.
- **Cradle:**
  - `certificateIssuance`;
  - `certificateExporter` y `certificateAssetSource`, de proceso como el mailer;
  - `completionSync` gana `certificateIssuance`.
- **Infraestructura:**
  - Dockerfile con `chromium` y `ttf-liberation`, y `CHROMIUM_PATH`/`CHROMIUM_NO_SANDBOX`
    en el entorno;
  - `vite.config.ts` excluye `puppeteer-core` del preempaquetado de desarrollo.
- **Compartido:** `StorageObjectLockedError` y los status 502 y 503 en `HTTP_STATUS`.
- **Fuera de alcance:** «Mis certificados» y la descarga del propio participante, el correo
  al emitir e `is_downloadable` (F-11); la verificación pública del folio (F-10).

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Emisión inexistente o fuera de alcance | `CERTIFICATE_ISSUE_NOT_FOUND` (404) |
| Emisión revocada | `CERTIFICATE_ISSUE_REVOKED` (409) |
| Servidor sin Chromium configurado | `CERTIFICATE_EXPORT_UNAVAILABLE` (503) |
| Chromium falló o una firma no se pudo leer | `CERTIFICATE_EXPORT_FAILED` (502) |
| Emitir a demanda en un curso por impartir | `TEACHING_CERTIFICATES_NOT_ISSUABLE` (409) |
| Borrar una firma que imprime una emisión | `STORAGE_OBJECT_LOCKED` (409) |
