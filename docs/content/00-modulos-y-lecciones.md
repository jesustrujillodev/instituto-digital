# Contenido del curso: módulos y lecciones — Referencia

## 1. Qué es

`app/modules/content` guarda el **temario** de un curso: módulos ordenados, cada
uno con sus lecciones ordenadas. Es lo que un curso autogestivo da a recorrer
cuando no se reúne con nadie.

También es el **aula**: donde el participante recorre ese temario y su avance
cuenta para completar el curso (§8).

Las decisiones están en
[ADR 0012](../adr/0012-estructura-de-contenido-y-modulo-propio.md) para la
estructura, [ADR 0013](../adr/0013-material-de-la-leccion.md) para el material y
[ADR 0014](../adr/0014-avance-por-leccion-y-completado-por-participante.md) para
el avance. El formato de curso que lo hace necesario, en
[ADR 0011](../adr/0011-formato-de-curso-y-regla-de-completado.md).

## 2. El modelo

| Tabla / columna | Qué guarda |
| --- | --- |
| `org.course_modules` | Una fila por módulo: `course_id`, `title`, `description?`, `order`, `archived_at` |
| `org.lessons` | Una fila por lección: `module_id`, `title`, `type`, `order`, `is_required`, `estimated_minutes?`, `archived_at` |
| `org.lesson_contents` | El material, uno por lección: `body?`, `file_url?`, `file_name?`, `file_size?`, `mime_type?`, `external_url?` |
| `org.lesson_progress` | El avance: PK `(lesson_id, user_id)`, `status` (`IN_PROGRESS \| COMPLETED`), `started_at`, `completed_at?`. Sin fila = sin empezar |

`LessonType` es `TEXT | FILE | VIDEO | LINK`. Se elige al crear la lección porque
decide qué editor se abre, no solo cómo se pinta. `VIDEO` está aparte de `FILE`
porque su lista de tipos y su tope de tamaño no se parecen en nada: con un solo
valor habría que aceptar la unión de los dos y se colaría un PDF de dos gigas.

`lesson_contents` tiene `lesson_id` único: **una lección, un material**. Si hace
falta un PDF junto a un video, son dos lecciones.

Tres convenciones que hay que tener presentes:

- **Borrar no existe.** Se archiva (`archived_at`), porque el avance por lección
  cuelga de estas filas.
- **Un módulo con lecciones activas no se archiva.** Se vacían primero, a mano.
  Archivar en cascada escondería lecciones que nadie pidió esconder.
- **`order` es contiguo desde 1 entre los activos**, y no tiene `@@unique`.
  Archivar re-empaqueta a los hermanos que quedan en la misma transacción; si no,
  la fila siguiente nacería con una posición ya ocupada.

## 3. Rutas y permisos

| Qué | Dónde |
| --- | --- |
| Editar el temario de un borrador | Paso **Contenido** de `/dashboard/cursos/:documentId/nuevo/5` |
| Editar el de un curso publicado | `/dashboard/cursos/:documentId/contenido` |
| Escribir el temario | `POST /dashboard/cursos/:documentId/contenido` |
| Leer y escribir el material de una lección | `/dashboard/cursos/:documentId/contenido/:lessonDocumentId` |
| Recorrer el temario (participante) | `/dashboard/mis-cursos/:documentId/aula` y `…/aula/:lessonDocumentId` |

Las dos pantallas de edición montan el **mismo panel** y escriben contra la misma
ruta. El paso del alta existe cuando el curso pide temario (`requiresContent`: un
`SELF_PACED` o un curso con regla `BOTH`); el resto salta del paso 4 al 6.

No hay rol de capacitador: quién puede tocar el temario sale de
`requireCourseScope` sobre el curso concreto, igual que editar su ficha. El
servicio lo vuelve a resolver por su cuenta, así que un curso fuera de alcance
responde igual que inexistente.

El temario se edita mientras el curso admite edición (`DRAFT` y `PUBLISHED`). Un
curso finalizado o cancelado responde `CONTENT_COURSE_NOT_EDITABLE`.

## 4. Los intents

Un `intent` y un `payload` JSON, como el resto de paneles del proyecto:

| Intent | Qué hace |
| --- | --- |
| `create-module` · `update-module` · `archive-module` | El módulo y su descripción |
| `create-lesson` · `update-lesson` · `archive-lesson` | La lección, su tipo, si es obligatoria y sus minutos |
| `reorder` | El árbol entero |
| `upload-url` · `save-material` | El material de una lección (en su propia ruta) |

**`reorder` recibe el orden nuevo completo, nunca «sube uno».** Un movimiento
relativo depende de lo que el cliente creía tener en pantalla, y dos pestañas
abiertas lo convierten en una escritura sobre un estado que ya cambió. El envío es
una permutación exacta de lo guardado o se rechaza entero.

Las lecciones se comparan por la unión de todas las listas y no módulo a módulo:
así mover una lección de módulo y reordenarla dentro del suyo son la misma
operación.

## 5. Lo que aporta a la publicación

Un curso que pide temario (`SELF_PACED`, o `SCHEDULED` con regla `BOTH`) no se
publica sin al menos una lección activa (`COURSE_WITHOUT_LESSONS`), y el
pendiente aparece en el checklist como `content`. En el resto ese pendiente **no
se enseña**: se omite, igual que `sessions` y `places` cuando el formato no los
pide.

El conteo llega a `courses` por inyección del puerto `contentRepository`, y solo
se consulta cuando el curso lo exige.

## 6. Límites

| Qué | Cuánto |
| --- | --- |
| Módulos por curso | 30 |
| Lecciones por módulo | 50 |
| Título de módulo o lección | 120 caracteres |
| Descripción de módulo | 500 caracteres |
| Minutos estimados de una lección | 1 a 480 |

No son límites de negocio sino del árbol: por encima de eso la pantalla deja de
ser navegable y reordenar con «subir / bajar» deja de tener sentido.

## 7. El material de una lección

Cada lección tiene un material y nada más, de la clase que diga su `type`. La
coherencia se impone en el propio contrato de entrada: una lección `LINK` sin
enlace no llega a ser un DTO.

| Clase | Qué se guarda | Cómo se ve |
| --- | --- | --- |
| `TEXT` | `body`: el árbol del documento en JSON | Editor Tiptap para quien captura, elementos React para quien lee |
| `FILE` | `file_url` + nombre, tamaño y tipo | PDF e imágenes incrustados, más botón de descarga |
| `VIDEO` | Lo mismo que `FILE` | Reproductor Vidstack sobre una URL firmada |
| `LINK` | `external_url` | YouTube, Vimeo y Drive incrustados; el resto, como enlace |

### 7.1 El cuerpo de texto no es HTML

Se guarda como **árbol JSON** y se pinta con elementos React. No hay parser, no
hay saneador y no hay `dangerouslySetInnerHTML`, así que no queda superficie de
XSS que mantener parcheada.

Lo que sostiene esa promesa son dos piezas que se leen juntas:

- `lessonBodyRule` (`domain/content.rules.ts`) es una **lista blanca cerrada** de
  nodos y marcas. Un nodo desconocido **se rechaza**, no se ignora, y el `href` de
  un enlace solo admite `http(s)` — es lo que impide un `javascript:` almacenado.
- `LessonBodyView` (`components/lesson-body-view.tsx`) solo sabe pintar esos
  nodos. Activar una extensión de Tiptap que el renderizador no conoce rompería el
  guardado, que es donde se quiere que rompa.

La lectura es **tolerante**, como la del tema: un blob que ya no encaja —porque la
fila quedó de un esquema anterior o porque alguien la escribió fuera de la
aplicación— cae al documento vacío en vez de lanzar.

El editor se carga con `lazy`: Tiptap solo lo descarga quien captura, y solo al
abrir el panel de una lección de texto.

### 7.2 El archivo no pasa por el servidor

Ni al subir ni al bajar.

1. El navegador pide permiso con `upload-url`. El servidor valida tipo y tamaño
   **antes de firmar**, genera la key —nada de lo que mande el cliente decide
   dónde cae el objeto— y devuelve una URL firmada de `PUT`.
2. El navegador escribe directo en el bucket, con barra de progreso real
   (`XMLHttpRequest`, que es la única API que informa del avance de una subida).
3. El navegador confirma con `save-material`. El servidor comprueba con
   `statObject` que el objeto llegó y que **cabe**: una firma de `PUT` fija el
   `Content-Type` pero no el tamaño, así que sin esta comprobación el tope no
   existiría. Solo entonces escribe la fila, con la referencia del proxy.

Para leer, el servicio firma una URL de TTL largo en cada carga. Los rangos que
pide el reproductor van directos al bucket y la key cruda nunca viaja al cliente.

El prefijo es `documentos/lecciones/`, **privado**: no cuelga de `media/` ni de
`profile-photos/`, así que `isPublicKey` lo deja fuera y el proxy exige sesión.

Reemplazar un material es volver a subir. Al hacerlo —y al archivar la lección— el
objeto anterior se borra en *best-effort* y fuera de la transacción: un objeto que
ya no está no puede tumbar una escritura que ya ocurrió, y si el borrado falla lo
recoge el escaneo de huérfanos del gestor de nube.

### 7.3 Sin transcodificación

Lo que sube el capacitador es lo que reproduce el navegador. Eso significa:

- **MP4 y WEBM, nada más.** Un `.mov` de teléfono no abre en Chrome.
- **MP4 progresivo con `Range`**, no HLS. El *seek*, la pantalla completa y la
  velocidad funcionan; lo que no hay es escalera de calidad, así que una conexión
  mala sufre. Adaptar la calidad pediría `ffmpeg`, segmentos y un manifiesto: un
  subsistema entero.

### 7.4 Límites del material

| Qué | Cuánto |
| --- | --- |
| Archivo (`FILE`) | 25 MB · PDF, PNG/JPG/WEBP y ofimática |
| Video (`VIDEO`) | 2 GB · MP4 o WEBM |
| Cuerpo de texto | 256 KB de JSON y 6 niveles de anidamiento |
| Vigencia de la firma de subida | 15 minutos |
| Vigencia de la firma de lectura | 6 horas |

La profundidad se comprueba **antes** del parseo estructural y sin recursión, para
que un documento absurdamente anidado se rechace en vez de agotar la pila.

## 8. El aula y el avance

El participante recorre el temario en `/dashboard/mis-cursos/:documentId/aula`: un
índice lateral con el estado de cada lección y la lección abierta con su
material, anterior y siguiente. Entrar sin lección lleva a «Continuar»: la primera
obligatoria sin completar; si no queda ninguna, la primera sin completar; con
todo hecho, la primera del temario.

### 8.1 Quién entra

| Situación | Resultado |
| --- | --- |
| Inscripción activa, curso publicado | Lee y registra avance |
| Inscripción activa, curso finalizado | Lee; registrar avance responde `CONTENT_CLASSROOM_READ_ONLY` |
| Sin inscripción activa | `CONTENT_NOT_ENROLLED`, también en un POST directo |
| Borrador o cancelado | `CONTENT_COURSE_NOT_FOUND` |

El guard de ruta es `requireParticipant`; la inscripción la exige el servicio. El
aula existe siempre que el curso tenga lecciones activas: en un curso por
asistencia es **material de apoyo** y la pantalla dice que no cuenta.

### 8.2 Marcar una lección

| Clase | Cómo se completa |
| --- | --- |
| `VIDEO` | Al dispararse `ended` en el reproductor |
| `TEXT`, `FILE`, `LINK` | Botón «Marcar como completada» |
| `VIDEO` sin archivo | Botón, o no terminaría nunca |

Abrir una lección la deja `IN_PROGRESS` con un POST al montarla: el loader no
escribe, porque precargar un enlace no es haberlo abierto. No se desmarca:
`nextProgressStatus` nunca baja de `COMPLETED`.

### 8.3 El porcentaje

- Mide las lecciones **obligatorias**; sin ninguna, el temario entero. Temario
  vacío: 0, y nunca completa.
- Entero y hacia abajo (`progressPercentOf`): solo vale 100 cuando no falta nada.
- `enrollments.progress_percent` es **caché**. Solo lo escribe
  `progressSync.recalculate` (`application/progress-sync.server.ts`), dentro de la
  transacción de quien escribe y con la fila del curso bloqueada. El aula
  recalcula en vivo; el caché es para los listados.
- La primera vez que llega a 100 fija `enrollments.content_completed_at`, que
  **no se borra**: una lección obligatoria añadida después baja el porcentaje pero
  no quita el completado a quien ya terminó.

### 8.4 Qué lo mueve

| Escritura | Recalcula |
| --- | --- |
| Completar una lección en el aula | A esa persona |
| Crear una lección, archivarla o cambiar su `isRequired` (curso publicado) | A todo inscrito |
| Reordenar, cambiar título o material | Nada: no cambia qué cuenta |

Si alguien termina el contenido y el curso completa en vivo —un autogestivo
publicado—, el recálculo llama a `completionSync` y la persona recibe su crédito
en ese mismo momento (docs/teaching/00-imparticion-creditos-y-valoracion.md §4.2).
En un curso con sesiones y regla `BOTH`, el contenido queda guardado y cuenta en
el cierre.
