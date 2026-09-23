# ADR 0018 · Diseño del certificado en JSON con borrador y publicado

**Estado:** aceptado · 2026-09-23
**Contexto del cambio:** MVP-02 · F-08, editor de certificados
**Extiende:** [ADR-0017](./0017-certificado-html-y-un-solo-renderizador.md) (el
renderizador que dibuja lo que aquí se guarda)

## 1. Contexto

Cada curso otorga un certificado propio, diseñado por quien lo administra. La
emisión (F-09) tiene que leer un diseño estable mientras alguien sigue editando
otro. El renderizador de F-07 ya fijó el contrato del diseño (`CertificateDesign`);
faltaba dónde guardarlo, quién puede tocarlo y cómo se ven las firmas.

El theme builder (`app/modules/theme/`) ya resolvió dos veces el mismo problema:
un blob JSON validado al leer, con borrador y publicado separados.

## 2. Decisiones

### 2.1 Una fila por curso con dos blobs

`org.course_certificates`:

- `course_id` es único.
- `draft_design` y `published_design` son `Json`, este último nulo hasta publicar.
- Lleva `published_at`.
- `is_downloadable` y `email_message` nacen aquí para F-11, sin pantalla todavía.

La fila nace en el primer guardado (upsert). Sin fila, el curso usa
`DEFAULT_CERTIFICATE_DESIGN`.

Es JSON y no columnas porque añadir un campo al diseño no debe pedir migración. El
coste es que la validación se escribe a mano, y por eso es obligatoria al leer.

### 2.2 Lectura tolerante, como el tema

`toCertificateDesign` valida con `v.safeParse` y nunca lanza. Si el blob no valida,
el repositorio registra el error y cae al diseño por defecto. Casos típicos: una fila
de un esquema anterior, una plantilla que ya no existe o una edición a mano. Un blob
roto no puede tumbar el editor ni, en F-09, la emisión.

### 2.3 Se publica lo guardado

«Publicar» copia el borrador **persistido**; la petición no lleva diseño. «Descartar
cambios» devuelve el borrador al publicado. En la pantalla, publicar se desactiva
mientras haya cambios sin guardar. Así lo que se emite siempre es algo que alguien
guardó y pudo revisar.

### 2.4 Lo administra quien administra el curso

La guarda es la misma que la del temario: `courseScopeWriteWhere(resolveCourseScope(actor))`.

- **Sin alcance de cursos** (un participante), `requireCourseScope` responde 403.
- **Con alcance pero sobre un curso ajeno**, responde 404, igual que un curso
  inexistente (ADR-0003).
- **Un capacitador interno** administra los cursos que creó; que le hayan asignado
  un curso para impartirlo no basta.

Se edita en todo estado **menos cancelado**, incluido finalizado. La emisión congela
el diseño en su propia fila (F-09), así que editarlo después solo alcanza a las
emisiones futuras.

### 2.5 Firmas privadas, con el curso en la key

La ficha original pedía `media/firmas/`, que es público y con CDN: la firma de un
titular quedaba descargable para cualquiera con la URL. Se cambió a
`documentos/firmas/<courseDocumentId>/<archivo>`:

- **Privada.** El proxy exige sesión: sin ella, redirige al inicio de sesión.
- **La key lleva el curso.** La fuente de referencias
  (`certificate-signature.references.server.ts`) sabe qué certificados cargar sin
  una tabla de firmas.
- **Se guarda solo la firma del propio curso.** `isOwnSignatureRef` acepta
  únicamente la referencia del proxy de una key bajo la carpeta de ESE curso. Una
  vista previa `blob:`/`data:`, una URL externa o la firma de otro curso se rechazan
  con `CERTIFICATE_SIGNATURE_NOT_OWNED`. Sin esta regla, cualquiera que administre
  un curso podría imprimir la firma de un titular ajeno.
- **La imagen se sube sola.** Pasa por el servidor, es un PNG pequeño, y la
  referencia entra al diseño al guardar. Una subida que nunca se guarda queda
  huérfana y la detecta el gestor de nube, como el material de F-04.
- **Reemplazar no borra la anterior.** El publicado o, desde F-09, una emisión
  pueden seguir usándola.

### 2.6 Vista previa en `iframe` con `allow-same-origin` y sin `allow-scripts`

El `iframe` aísla el CSS del certificado del de la app.

- **Sin `allow-scripts`**, el documento no ejecuta nada.
- **Con `allow-same-origin`**, la cookie de sesión acompaña la petición de la firma
  privada al proxy. Con un origen opaco, esa petición saldría sin sesión.

Las dos banderas juntas serían peligrosas; esta sola no.

El documento se deriva de `useDeferredValue(design)`, así que escribir no regenera
el `iframe` bloqueando la entrada. Los datos de muestra (persona, horas, fecha y
primer folio) solo dependen del formato del folio.

### 2.7 Dentro del dashboard, sin pantalla completa

La ficha pedía un editor a pantalla completa. Se descartó: el lienzo es un `iframe`
escalado con `transform: scale()` al ancho disponible, así que el layout no afecta
al rendimiento. Lo que sí cuesta son las regeneraciones del documento, y eso lo
resuelve el punto anterior. La pantalla es una sola ruta,
`/dashboard/cursos/:documentId/certificado`, con el grid del theme builder: paneles
a la izquierda y vista previa fija a la derecha.

### 2.8 Guardado explícito

Hay botón «Guardar» y `UnsavedChangesDialog`, el del wizard, avisa al salir con
cambios. A diferencia del tema no hay autoguardado: el certificado es un documento
institucional y cada guardado tiene que ser intencional.

## 3. Consecuencias

- **Esquema**: `org.course_certificates` y la relación `Course.certificate`.
- **Cradle**: `certificateRepository` y `certificateService`, y la fuente de firmas en
  `objectReferenceSources`. `ObjectOwnerType` gana `"certificate"`.
- **Adelantos para F-09**: `resolveFolio` (tokens `{seq}`, `{year}` y `{month}`) y
  `formatZonedLongDate` ya existen. La vista previa los usa con el primer
  consecutivo.
- **Fuera de alcance**:
  - El panel «Exportar» y la emisión (F-09).
  - Los controles de `is_downloadable` y `email_message` (F-11).
  - Incrustar la firma privada en el PDF: el exportador tendrá que leer los bytes con
    `storageProvider.getFile`, porque no tiene la sesión del navegador.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Curso inexistente o fuera de alcance | `CERTIFICATE_COURSE_NOT_FOUND` (404) |
| Editar, publicar o subir firma en un curso cancelado | `CERTIFICATE_NOT_EDITABLE` (409) |
| Descartar cambios sin un publicado | `CERTIFICATE_NEVER_PUBLISHED` (409) |
| Imagen de firma que no es PNG/WEBP, vacía o de más de 1 MB | `CERTIFICATE_SIGNATURE_INVALID` (400) |
| Diseño con una firma que no se subió a este curso | `CERTIFICATE_SIGNATURE_NOT_OWNED` (400) |
| Diseño que no valida (plantilla, acento, topes de texto, dos firmantes) | Validación de frontera (400) |
