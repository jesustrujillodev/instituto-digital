# Contenido del curso: módulos y lecciones — Referencia

## 1. Qué es

`app/modules/content` guarda el **temario** de un curso: módulos ordenados, cada
uno con sus lecciones ordenadas. Es lo que un curso autogestivo da a recorrer
cuando no se reúne con nadie.

Las decisiones están en
[ADR 0012](../adr/0012-estructura-de-contenido-y-modulo-propio.md), y el formato
de curso que lo hace necesario, en
[ADR 0011](../adr/0011-formato-de-curso-y-regla-de-completado.md).

Lo que **no** es todavía:

- No guarda el material. Una lección declara de qué **tipo** será (texto, archivo
  o enlace), pero el cuerpo, la key de storage y el enlace llegan después.
- No registra avance. Nadie marca una lección como vista, y el completado del
  curso sigue saliendo del resultado capturado a mano.
- No lo ve el participante. Por ahora solo lo edita quien administra el curso.

## 2. El modelo

| Tabla / columna | Qué guarda |
| --- | --- |
| `org.course_modules` | Una fila por módulo: `course_id`, `title`, `description?`, `order`, `archived_at` |
| `org.lessons` | Una fila por lección: `module_id`, `title`, `type`, `order`, `is_required`, `estimated_minutes?`, `archived_at` |

`LessonType` es `TEXT | FILE | LINK`. Se elige al crear la lección porque decide
qué editor se abrirá, no solo cómo se pinta.

Tres convenciones que hay que tener presentes:

- **Borrar no existe.** Se archiva (`archived_at`), porque el avance por lección
  colgará de estas filas.
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
| Escribir | `POST /dashboard/cursos/:documentId/contenido` |

Las dos pantallas montan el **mismo panel** y escriben contra la misma ruta. El
paso del alta solo existe cuando el formato es `SELF_PACED`; un curso con
sesiones salta del paso 4 al 6.

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

**`reorder` recibe el orden nuevo completo, nunca «sube uno».** Un movimiento
relativo depende de lo que el cliente creía tener en pantalla, y dos pestañas
abiertas lo convierten en una escritura sobre un estado que ya cambió. El envío es
una permutación exacta de lo guardado o se rechaza entero.

Las lecciones se comparan por la unión de todas las listas y no módulo a módulo:
así mover una lección de módulo y reordenarla dentro del suyo son la misma
operación.

## 5. Lo que aporta a la publicación

Un curso `SELF_PACED` no se publica sin al menos una lección activa
(`COURSE_WITHOUT_LESSONS`), y el pendiente aparece en el checklist como `content`.
En un curso `SCHEDULED` ese pendiente **no se enseña**: se omite, igual que
`sessions` y `places` cuando el formato no los pide.

El conteo llega a `courses` por inyección del puerto `contentRepository`, y solo
se consulta cuando el formato lo exige: un curso con sesiones nunca mira sus
lecciones.

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
