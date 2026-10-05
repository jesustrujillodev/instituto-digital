# Cursos, sesiones y acceso — Referencia

## 1. Qué es

`app/modules/courses/` administra la unidad que se imparte y se acredita: el
curso, sus sesiones, quién lo imparte y a quién va dirigido. Entrega §6.5 del
alcance desde el lado del **organizador**: crear en borrador, publicar con
validaciones, editar y cancelar.

Lo que **no** hace todavía, y quién lo hace:

| Pendiente | PRD |
| --- | --- |
| Calendario | PRD-05 (`docs/calendar/00-calendario.md`) |
| Estado `FINISHED`, asistencia, créditos y valoración | PRD-06 (`docs/teaching/00-imparticion-creditos-y-valoracion.md`) |
| Plan anual y "crear curso desde esta línea" | PRD-07 (`docs/annual-plan/00-plan-anual.md`) |

La inscripción, las invitaciones y "Mis capacitaciones" viven en su propio módulo
(`docs/enrollments/00-inscripcion-e-invitaciones.md`), que consume la regla de
visibilidad de §5.

## 2. El modelo

| Tabla | Qué guarda |
| --- | --- |
| `org.courses` | El curso. Organizadora, horas opcionales, modalidad, formato, regla de completado, acceso, cupo y fecha límite opcionales, asistencia mínima (80 por defecto), si requiere evaluación, calificación mínima (`min_passing_grade`, 70 por defecto), las columnas de los dos QR, estado con sus instantes (`published_at`, `cancelled_at`, `finished_at`), autor, `plan_line_id` y `cover_image_url` |
| `org.course_sessions` | Fecha y horario concretos: `starts_at`, `ends_at`, sede y enlace |
| `org.course_trainers` | Quién imparte. PK `(course_id, user_id)` |
| `org.course_dependency_audience` | Audiencia por dependencia completa. PK `(course_id, dependency_id)` |
| `org.course_group_audience` | Audiencia por lista nominal. PK `(course_id, group_id)` |

Decisiones que el schema no dice por sí solo:

- **`modality` y `format` son dos ejes, no uno.** La modalidad dice DÓNDE se
  reúne (`IN_PERSON`, `ONLINE`, `HYBRID`) y el formato dice SI se reúne
  (`SCHEDULED`, `SELF_PACED`). Meter el autogestivo en la modalidad habría
  degradado `requiresVenue`/`requiresLink`, que necesitan saber si la sesión pide
  sede, enlace o las dos. Ver
  [ADR 0011](../adr/0011-formato-de-curso-y-regla-de-completado.md).
- **`completion_rule` decide qué cuenta como completar.** `ATTENDANCE` es la de
  siempre; `CONTENT` cuenta las lecciones obligatorias terminadas; `BOTH`, las dos
  cosas. La evaluación es un término aparte y opcional en las tres. Un
  `SELF_PACED` con una regla que cuente asistencia se rechaza en el alta con
  `COURSE_INCOMPATIBLE_COMPLETION_RULE`
  ([ADR 0014](../adr/0014-avance-por-leccion-y-completado-por-participante.md)).
- **`requires_evaluation` es el examen final en línea.** No hay captura manual
  ([ADR 0027](../adr/0027-seguimiento-en-linea-y-fin-de-la-captura-manual.md)): se
  congela al publicar en cualquier formato, y un curso con evaluación final no se
  publica sin examen con preguntas (`COURSE_WITHOUT_QUIZ`).
- **El seguimiento también bloquea la publicación.** Cada evaluación de
  seguimiento necesita preguntas (`COURSE_FOLLOW_UP_WITHOUT_QUESTIONS`, pendiente
  `followUps`), y quitar en la edición una sesión cuyo seguimiento ya presentó
  alguien se rechaza (`COURSE_SESSION_HAS_ATTEMPTS`).
- **El examen se guarda al continuar.** En el paso Evaluación el editor no tiene
  botón propio: el wizard lo guarda antes que los campos del paso y, si le falta
  algo, no avanza y dice qué (`quizProblemsOf`, las mismas reglas que
  `saveQuizRule`). Fuera del wizard —la práctica de una lección y la evaluación
  de un módulo— el editor conserva su botón.
- **`min_passing_grade` es el promedio con el que se acredita** cuando la nota
  se calcula sola (`gradesAutomatically`: examen final, temario que cuenta o un
  seguimiento que cuenta). Va de 0 a 100 y compensa: reprobar una evaluación no
  impide acreditar si el promedio alcanza
  ([ADR 0024](../adr/0024-intentos-configurables-y-calificacion-minima-del-curso.md)).
- **Al publicar se congelan la evaluación final y la calificación mínima**, en
  cualquier formato: cambiarlas a mitad dejaría resultados medidos de dos
  formas. En un autogestivo se congela además la regla de completado, porque
  sus créditos se otorgan conforme cada quien completa.
  `assertCompletionSettingsEditable` lo rechaza con `COURSE_COMPLETION_LOCKED`.
- **Las columnas del QR son dos pares independientes.** `qr_token` y
  `qr_token_rotated_at` son el QR de asistencia: nulo mientras nadie lo genere, y
  rotarlo invalida el impreso. `qr_opens_before_minutes` y
  `qr_closes_after_minutes` (15 y 15 por defecto) son la tolerancia de la
  ventana de escaneo alrededor de cada sesión
  ([ADR 0009](../adr/0009-asistencia-por-qr.md)). `enrollment_qr_token` y
  `enrollment_qr_token_rotated_at` son el QR de inscripción del póster, que se
  regenera por separado. Los dos tokens son únicos y los escriben
  `rotateQrToken` y `rotateEnrollmentQrToken`.
- **`enrollment_closed_at` es el cierre del autogestivo**, que no se finaliza:
  con valor, nadie nuevo se inscribe y quien ya estaba sigue avanzando. Lo abre y
  lo cierra la impartición.
- **El formato se congela al publicar.** `canEdit` admite tocar un curso
  `PUBLISHED`, pero pasarlo a autogestivo borraría sus sesiones y, con ellas, las
  filas de `course_attendance`, que cuelgan de `session_id`. Lo impide
  `assertFormatEditable` con `COURSE_FORMAT_LOCKED`.
- **`hours` son las horas que acredita el curso, y las capturadas mandan.** Son
  enteras, de 1 a 500 (`COURSE_HOURS_LIMITS`), y opcionales: no hay check de
  publicación. Sin ellas, un curso con sesiones acredita la duración sumada de
  sus sesiones, y un autogestivo no muestra horas. Esa resolución vive en una
  sola función pura, `courseHoursOf`, y la usan la ficha, «Mis capacitaciones», el Excel
  de finalizados y «Mis créditos». La columna es nula en los cursos anteriores,
  que siguen mostrando las horas de sus sesiones. Las horas se muestran y no se
  convierten: un curso completado vale un crédito, dure lo que dure (D-06 de
  MVP-02).
- **No hay `archived_at`.** La baja de un curso es `status = CANCELLED`, que
  conserva sus sesiones, capacitadores y audiencia (§6.5). Dos mecanismos de baja
  sobre la misma fila se contradirían.
- **`plan_line_id` apunta a la línea del plan anual** (PRD-07). Es opcional y
  se elige en el paso General. Cambia solo mientras el curso es borrador
  (`assertPlanLineEditable`), bloqueando la línea nueva, y la de un plan cerrado
  no se suelta. Un curso cancelado conserva el vínculo como historial. Ver
  [ADR 0007](../adr/0007-plan-anual-estado-derivado.md).
- **La audiencia son dos tablas y no una con dos columnas nulas.** Ver
  [ADR 0003](../adr/0003-alcance-de-cursos-y-audiencia.md) §2.2.
- **La organizadora no cambia.** La regla de edición no la declara: moverla
  arrastraría audiencia, capacitadores y, desde PRD-06, créditos otorgados a
  nombre de la anterior.
- **`cover_image_url` guarda la referencia del proxy**, nunca la URL del
  proveedor: `/api/storage?key=media/portadas/…`. La key cuelga de `media/`, que
  es público y elegible para CDN, así que el catálogo la pinta sin sesión y con
  caché. El curso es el primer consumidor vivo de la abstracción de storage
  ([storage §5.1](../storage/00-sistema-almacenamiento.md)).

## 3. Las horas

La plataforma opera **siempre** en `America/Tijuana`. Todo instante se guarda en
UTC; se captura y se muestra en la hora del instituto, y la conversión pasa por
un solo archivo: `app/lib/date-utils.ts`.

```
formulario  "2026-11-20" + "09:00"   (hora de Tijuana, sin offset)
    │  zonedInputToUtc — en el SERVICIO
    ▼
base        2026-11-20T17:00:00Z
    │  utcToZonedInput / formatSessionRange — en la frontera de presentación
    ▼
pantalla    "20 nov 2026, 09:00–13:00"
```

No hay librería de fechas: `Intl` ya conoce el horario de verano. El helper
resuelve el desfase en dos pasos para acertar también el día del cambio, y la
prueba fija un desfase de 7 horas en julio y de 8 en noviembre.

La fecha límite de inscripción se captura como **día**: se guarda el último
minuto de ese día en Tijuana.

## 4. Quién administra qué

### 4.1 · El alcance propio del módulo

La matriz de §3 da al capacitador interno "crear cursos en su dependencia" y
"editar, publicar y cancelar **los que creó**". Un capacitador con rol `USER`
resuelve a `self` en el `AccessScope` compartido, que para cursos significaría
"ninguno". Por eso el módulo traduce el alcance a uno suyo:

```
global      → SUPERADMIN
dependency  → DEPENDENCY_HEAD, DEPENDENCY_DEPUTY con dependencia
creator     → cualquier otro rol + perfil de capacitador + dependencia
none        → el resto, incluido el capacitador EXTERNO
```

El externo cae en `none` porque no tiene dependencia, que es lo que §4 del
alcance pide: solo imparte, no crea. Quien es titular y además capacitador
conserva el alcance más amplio.

`courseScopeWhere` y `courseScopeWriteWhere` siguen el mismo patrón que `users` y
`groups`: `none` es un predicado imposible al leer y `null` al escribir, nunca
`{}`. El filtro va dentro del `where`, así que **fuera de alcance responde igual
que inexistente** (404).

### 4.2 · El guard

`requireRole` solo compara contra la tupla de roles y no expresa "o es
capacitador interno". Las rutas usan `requireCourseScope`
(`routes/require-course-scope.server.ts`): `requireAuth` + `canManageCourses` +
`forbiddenRole`, el mismo 403 que da `requireRole`. El patrón nació en el
catálogo de capacitadores de PRD-02, retirado en ADR 0022.

### 4.3 · La dependencia organizadora

La elige solo el alcance global. Los demás la heredan **ignorando lo que venga
del formulario** (`resolveOrganizerDependency`): aceptarla permitiría crear un
curso en otra unidad enviando el formulario a mano. Una dependencia desactivada
no organiza cursos nuevos.

### 4.4 · Audiencia y capacitadores elegibles

- **Capacitadores:** catálogo global (§4). Cualquier organizador asigna a
  cualquier capacitador con perfil y cuenta activos. Un `SELF_PACED` no tiene
  capacitadores (`requiresTrainer`): el formulario y el servicio descartan los
  que lleguen, como las sesiones, y lo opera la dependencia organizadora.
- **Dependencias de audiencia:** cualquiera activa. Abrir un curso a otras
  dependencias es de lo que trata §1.
- **Grupos de audiencia:** los del alcance de quien elige. Un grupo es una lista
  nominal de una unidad, y verlo es leer a su gente.

El servicio **rechaza el lote entero** si algún capacitador, dependencia o grupo
pedido no está disponible, igual que el alta de miembros de un grupo. Un curso
que no es `RESTRICTED` descarta la audiencia enviada en vez de guardarla latente.

## 5. Quién puede ver un curso

Criterio 3 de §7: *un curso restringido o por invitación no aparece, ni por
listado ni por URL directa, a quien no tiene acceso.*
`courseVisibilityWhere(viewer)` en `domain/course.access.ts` es la unión de:

1. Lo que administra (`courseScopeWhere`).
2. Lo que imparte.
3. Si el curso está publicado o finalizado y el visor es interno: lo público, y
   lo restringido a su dependencia o a un grupo al que pertenece **ahora**.

4. Si el visor es interno y tiene una invitación pendiente o una inscripción
   activa en el curso, sea cual sea su acceso.

`INVITATION` no tiene rama por tipo de acceso: un curso por invitación solo se
abre por la rama 4. Esa misma rama mantiene visible un curso restringido para
quien salió del grupo después de inscribirse (§6.4 del alcance).

`dependencyVisibilityWhere(dependencyId)` es la variante para una dependencia
completa —lo que organiza, lo público y lo restringido a ella o a sus grupos— y
acota a qué cursos puede asignar personal un titular o auxiliar.

El cupo tampoco puede editarse por debajo de los inscritos: `update` bloquea la
fila del curso con el mismo `lockCourseSeats` de la inscripción y falla con
`COURSE_CAPACITY_BELOW_ENROLLED`.

## 6. Ciclo de vida

```
DRAFT ──publicar──▶ PUBLISHED ──finalizar (teaching)──▶ FINISHED
  │                     │
  └──────cancelar───────┴──▶ CANCELLED
```

**Un borrador puede estar incompleto.** Se guarda con cero sesiones, sin
capacitador o sin sede. Lo que §6.5 exige se comprueba al **publicar**
(`assertPublishable`), y cada condición tiene su código:

| Falta | Código |
| --- | --- |
| Al menos una sesión (solo si el formato es `SCHEDULED`) | `COURSE_WITHOUT_SESSIONS` |
| Al menos una lección (solo si el curso pide temario: `SELF_PACED` o regla `BOTH`) | `COURSE_WITHOUT_LESSONS` |
| Un examen con al menos una pregunta (solo si se evalúa con examen en línea) | `COURSE_WITHOUT_QUIZ` |
| Al menos un capacitador con perfil activo (si el curso admite sesiones: `SCHEDULED` o híbrido autogestivo) | `COURSE_WITHOUT_ACTIVE_TRAINER` |
| Sede en cada sesión (presencial, híbrida) | `COURSE_SESSION_MISSING_VENUE` + `sessionNumber` |
| Enlace en cada sesión (en línea, híbrida) | `COURSE_SESSION_MISSING_LINK` + `sessionNumber` |
| Audiencia si es restringido | `COURSE_AUDIENCE_REQUIRED` |

Un curso `SELF_PACED` se publica sin una sola sesión, y `publishChecklist` omite
de la lista los pendientes `sessions`, `places` y `trainer` en vez de marcarlos cumplidos
—el mismo criterio que `audience` cuando el acceso no es restringido—. A cambio
enseña `content`, que un curso con sesiones no ve. Las dos funciones describen la
misma regla y una prueba cruzada las obliga a coincidir.

El conteo de lecciones no vive en este módulo: `assertPublishable` y
`publishChecklist` lo reciben como segundo argumento obligatorio
(`CourseContentFacts`), y el caso de uso lo pide al puerto `contentRepository`
solo cuando el curso pide temario (`requiresContent`)
([ADR 0012](../adr/0012-estructura-de-contenido-y-modulo-propio.md)).
`requiresContent` recibe el curso y no el formato: también decide si el alta
enseña el paso Contenido (`stepsFor`).

**Un publicado sigue cumpliendo.** Editarlo no puede dejarlo sin sesiones, sin
capacitador, con una sesión sin sede o enlace, ni restringido sin audiencia:
`update` comprueba lo que va a escribir con `assertStaysPublishable`, que son
las condiciones de `assertPublishable` que el formulario del curso puede
deshacer, con los mismos códigos. El temario y los exámenes se editan en
`content` y no entran.

El número de sesión viaja en `details` porque es lo único accionable del
mensaje. Al guardar sí se comprueban el rango de cada sesión, el tope de sesiones
y que la fecha límite no sea posterior a la primera sesión.

La validación de **traslapes** de horario queda fuera (§8 del alcance).

## 7. Escrituras

`create` y `update` escriben curso, sesiones, capacitadores y audiencia en una
sola `runInTransaction`. Dentro, las colecciones se tratan distinto:

| Colección | Estrategia | Por qué |
| --- | --- | --- |
| Capacitadores y audiencia | Se diferencian: se borra lo quitado y se inserta lo añadido | Guardar un paso que no las toca no escribe nada; un capacitador que sigue conserva su `assigned_at` |
| Sesiones | Se **diferencian** por `documentId` | Desde PRD-06 cada sesión cuelga su asistencia; recrearlas cambiaría su identidad |

Una sesión solo se actualiza si su `documentId` pertenece a **ese** curso y si
cambió su horario, sede o enlace: uno ajeno enviado a mano se trata como sesión
nueva. Las nuevas entran en un solo `createMany`, y `create` escribe el curso con
sus cuatro colecciones en una sola llamada.

Quitar una sesión borra en cascada su material, su seguimiento y su asistencia.
Por eso `update` rechaza quitar una cuyo seguimiento ya presentó alguien
(`COURSE_SESSION_HAS_ATTEMPTS`) o que ya tiene asistencia registrada
(`COURSE_SESSION_HAS_ATTENDANCE`): las dos cosas cuentan para acreditar.

### 7.1 · La portada entra en la misma unidad de trabajo

La subida no es un paso aparte que ocurra "antes" o "después" de guardar:
`withStorageTransaction` **envuelve** a `runInTransaction`.

```
withStorageTransaction            ← sube la portada y la registra para rollback
  └── runInTransaction            ← curso, sesiones, capacitadores, audiencia
```

Si la fila falla —el cupo por debajo de los inscritos, la línea del plan ocupada,
el alcance, el estado— el objeto recién subido se borra y se re-lanza el error
original. Sin
esa composición, cada guardado fallido dejaría una portada que ninguna fila
referencia.

El servicio recibe `storageProvider`, `storageBucket` y `storagePublicBucket`
**por el cradle**; `withStorageTransaction` sí se importa, porque es un helper
puro construido sobre el puerto. El bucket lo decide la key vía `bucketForKey`,
no el módulo.

Tres estados, no dos:

| Lo que llega | Qué pasa |
| --- | --- |
| Archivo en el campo `cover` | Sustituye, y la anterior se borra **best-effort después** del commit |
| `removeCover: true` en el payload | La columna queda en `null` y el objeto se borra |
| Ninguno de los dos | Se conserva: `coverImageUrl` ni siquiera entra al `data` de Prisma |

La validación de tipo y tamaño corre en el servicio **antes** de la transacción y
lanza `CourseCoverInvalidError`: el `StorageValidationError` de la transacción no
es un `DomainError` y llegaría al cliente como error inesperado.

`infrastructure/course-cover.references.server.ts` publica la fuente
`IObjectReferenceSource` del módulo, registrada en `objectReferenceSources`. Sin
ella el gestor de nube marcaría toda portada como huérfana y la borraría.

### 7.2 · Peticiones simultáneas

Cada transición escribe condicionada al estado, y una condición que ya no se
cumple falla con `COURSE_STATE_CHANGED` (409) en vez de pisar el cambio ajeno:

| Escritura | Condición |
| --- | --- |
| `publish` | Bloquea la fila (`courseRepository.lock`), lee el curso y comprueba sus requisitos dentro de la transacción, y escribe solo si sigue en `DRAFT` |
| `cancel` | Escribe solo si el curso sigue en el estado que se leyó: un borrador que alguien publicó entretanto no se cancela sin avisar a sus inscritos |
| `update` | Igual que `cancel`, con la fila bloqueada por `lockCourseSeats` |
| `finish` (teaching) | Solo desde `PUBLISHED` |

Sin esto, cancelar mientras otra persona publicaba podía dejar publicado un curso
cancelado, y una edición simultánea podía quitarle las sesiones a un curso entre
la comprobación de `publish` y su escritura.

## 8. El formulario

Nivel 3 de la [guía de formularios](../guia-formularios-react-router-rhf.md):
`FormProvider`, un paso por bloque, `useFieldArray` para las sesiones y
`useWatch` acotado a los campos que dependen del acceso o la modalidad.

Alta y edición usan **el mismo wizard** (`CourseWizard`), con los pasos en el
orden en que se llena un curso (`utils/course-wizard-steps.ts`):

| # | Paso | Qué captura |
| --- | --- | --- |
| 1 | General | Dependencia (solo superadmin), título, descripción, horas, portada |
| 2 | Programa | Formato, modalidad, capacitadores, sesiones |
| 3 | Contenido | Módulos y lecciones; solo si `requiresContent` |
| 4 | Evaluación | «Así se acredita», un resumen de las reglas. La calificación mínima de la capacitación, cuando la nota se calcula sola, con lo que entra al promedio. Después, «Requisitos»: asistir (con la asistencia mínima), terminar las lecciones obligatorias (cuenta también las evaluaciones de módulo, que se editan en Contenido) y aprobar una evaluación final, que despliega su examen; son `completionRule` y `requiresEvaluation`. Al final, con su propio interruptor, las evaluaciones de seguimiento (solo calendarizados, [ADR 0027](../adr/0027-seguimiento-en-linea-y-fin-de-la-captura-manual.md)) |
| 5 | Inscripción | Acceso, audiencia, cupo, fecha límite |
| 6 | Revisión | Pendientes y publicar; solo en el alta |

- **El estado decide el modo.** Un borrador va por `/capacitaciones/:id/nuevo/:paso`
  (alta, con revisión y publicar); un publicado por `/capacitaciones/:id/editar/:paso?`
  (edición, sin revisión: el último paso guarda y sale). La URL del otro modo
  redirige a la correcta, y un finalizado o cancelado va a su ficha. Loader y
  action son comunes: `routes/course-wizard.server.ts`.
- **El número de paso es la URL, la posición es lo que se ve.** Un calendarizado
  sin temario salta del 2 al 4 y lee "Paso 3 de 5" en Evaluación.
- **Elegir una regla que pide temario lleva a Contenido.** Si al guardar
  Evaluación el curso pasa a necesitar lecciones que no tenía, el siguiente paso
  es Contenido aunque esté antes.
- **A dónde se vuelve.** `?volver=imparticion` hace que salir o terminar la
  edición regrese a la ficha de impartición; cualquier otro valor lleva a la
  ficha del curso (`editReturnPath`), nunca a una dirección arbitraria.
- **Las evaluaciones de seguimiento se arman en el mismo paso.** Su configuración
  (nombre, sesión, si cuenta, ventana, mínima, intentos y orden) se edita en un
  modal y se guarda al aceptar (`save-follow-up`); sus preguntas se editan en su
  tarjeta, dentro del paso, y se guardan al continuar con las del examen final
  (`save-follow-up-questions`). `remove-follow-up` la quita. La recarga tras
  guardar el modal trae el mismo curso, así que el wizard solo reinicia el
  formulario cuando cambian los valores, no el objeto: lo capturado sin guardar
  en el paso no se pierde.

- **Un solo contrato.** `utils/build-course-payload.ts` traduce los valores del
  formulario (todo texto) a la entrada de la regla de dominio, y
  `createCourseFormRule` es esa traducción seguida de **la misma regla que usa el
  servidor**. Los nombres de campo se conservan, así que un error de
  `sessions.1.startTime` cae en su input.
- **El envío es un JSON dentro de un multipart.** El curso viaja en un único
  campo `payload`; con un campo por clave, el parser del servidor tendría que
  saber a mano qué es número, booleano o colección, y esa lista se desincroniza
  del esquema. La portada no cabe en ese JSON —un `File` no sobrevive a
  `JSON.stringify`— así que va en su propio campo `cover` y el envío usa
  `toFormData` + `encType: "multipart/form-data"` ([guía §10.1](../guia-formularios-react-router-rhf.md)).
- **La portada vive fuera de react-hook-form.** No participa en ninguna regla del
  esquema, y declarar un `File` en un contrato que también corre en el servidor
  lo partiría en dos ([guía §10.4](../guia-formularios-react-router-rhf.md)).
  `parseCourseFormData` la extrae con `formData.get()` antes de recorrer los
  campos de texto. Quitarla viaja como `removeCover` en el payload, porque
  `FormData` no transporta `null`.
- **Se reescala en el navegador.** `resize-cover-image.ts` recorta a 16:9, reduce
  a 1600 px y recodifica a WebP antes de enviar; la vista previa muestra el
  archivo que de verdad se va a guardar. Una cuadrícula de doce tarjetas baja
  doce portadas: sin esto, doce fotos de teléfono.
- Publicar y cancelar van por su propio `fetcher` en la ficha, y publicar usa lo
  último **guardado**.
- **Guardar y salir no recarga el paso.** El envío lleva `leaving=true` cuando
  el asistente va a navegar después, y `shouldRevalidateCourseStep` evita la
  recarga del paso que se abandona: el destino carga lo suyo. Guardar y
  quedarse, un fallo, o sesiones nuevas con material pendiente sí recargan,
  porque el paso necesita la identidad de lo recién guardado.

### 8.1 · Lo que lee cada pantalla

| Pantalla | Lee |
| --- | --- |
| Ficha | El curso y `enrollmentService.findRosterSummary`: inscritos e invitaciones pendientes contados, nunca la lista. Los conteos de contenido solo en borrador |
| Paso del asistente | El curso y, en una sola fase, lo que el paso pinta: las opciones de los selectores solo en General, Programa e Inscripción; el temario en Contenido, Evaluación y Revisión; el banco del examen y los de todo el seguimiento (`quizService.findFollowUpBanks`, una consulta) solo en Evaluación |

Un `documentId` malformado en la URL responde 404, igual que uno inexistente
(`requireCourseParam`).

## 9. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| Un participante entra a administrar cursos | `requireCourseScope`: sin alcance, 403 igual al de `requireRole` |
| Un capacitador externo crea cursos | Sin dependencia resuelve a `none` |
| Un capacitador interno edita el curso de su titular | Alcance `creator` filtra por autor dentro del `where`: 404 |
| Alguien abre por URL un curso de otra dependencia | Filtro en el `where`: fuera de alcance es 404, no el registro |
| Se crea un curso en otra dependencia enviando el formulario a mano | `resolveOrganizerDependency` ignora el campo fuera del alcance global |
| Un filtro de la URL amplía el listado | Fuera del alcance global el filtro de dependencia ni se lee |
| Se asigna a alguien que no es capacitador activo | `findEligibleTrainers` + rechazo del lote entero |
| Se usa de audiencia un grupo ajeno | `findEligibleGroups` recibe el alcance de quien elige |
| Se publica un curso que nadie puede impartir | `assertPublishable` exige un capacitador con perfil **y** cuenta activos |
| Editar un curso deja huérfana su asistencia (PRD-06) | Sesiones diferenciadas por `documentId`, nunca recreadas |
| Un `documentId` de otra sesión se cuela en el envío | Solo se actualizan las sesiones que pertenecen al curso |
| Una sesión de noviembre se guarda una hora corrida | Conversión única con `Intl` y prueba de verano e invierno |
| Un curso por invitación aparece a cualquiera | `courseVisibilityWhere` solo lo abre por invitación o inscripción propia |
| Se sube como portada un ejecutable o un archivo enorme | `validateUploadInput` con los límites de `COURSE_COVER`, en cliente y en servidor, más la validación de la transacción |
| Un guardado fallido deja una portada huérfana | `withStorageTransaction` envuelve a la transacción de base y revierte la subida (§7.1) |
| El gestor de nube borra una portada en uso | `createCourseCoverReferenceSource` registrada en `objectReferenceSources` |
| Bajar el cupo deja fuera a inscritos | `assertCapacityCovers` dentro de la transacción, con la fila bloqueada |
| Editar un publicado lo deja sin sesiones, capacitador o audiencia | `assertStaysPublishable` en `update` |
| Quitar una sesión borra la asistencia con la que se acredita | `COURSE_SESSION_HAS_ATTENDANCE` antes de escribir |
| Publicar y cancelar a la vez deja publicado un curso cancelado | Escrituras condicionadas al estado y `COURSE_STATE_CHANGED` (§7.2) |

## 10. Lo que queda enganchado

- **PRD-08:** `update` de un curso publicado encola `COURSE_UPDATED` si
  `hasScheduleChanges` detecta sesiones añadidas o quitadas, u otro horario, sede
  o enlace. `cancel` de un publicado encola `COURSE_CANCELLED`. Los dos avisan a
  inscritos e invitados pendientes, dentro de su transacción
  (`docs/notifications/00-notificaciones.md`).
- **PRD-05** tiene su índice: `course_sessions(starts_at)`.
- **PRD-06** ya escribe `FINISHED` desde `teaching` por `ICourseRepository.finish`,
  condicionado a `PUBLISHED`. La asistencia cuelga de las sesiones y se borraría
  en cascada con ellas: `update` no quita una sesión que ya la tiene.
- **PRD-07** ya declaró la relación de `plan_line_id`: `create` y `update`
  reciben `planLine` y la reclaman con `claimPlanLine`. En `update`, ausente
  conserva y `null` suelta. Cancelar y finalizar no tocan el plan porque el
  estado de la línea se deriva.

El enlace "Cursos" del menú lo ve todo capacitador con dependencia
(`requiresDependency`, a partir de `SessionUser.hasDependency`): el externo no
crea cursos y ya no recibe un enlace que le respondería 403.

## 11. Añadir una operación

1. Lectura → parámetro `scope: CourseScope`. Mutación → `actor: AuthContext`.
2. Declárala en el puerto. TypeScript señala cada punto que la olvide.
3. En el repositorio, funde el filtro **dentro del `where`**; para escribir usa
   `writeWhere`, que corta `none` antes de la base.
4. Si depende del estado, añade el predicado a `course.rules.ts` con su código.
5. La prueba que importa no es el camino feliz: es que `creator` no escriba lo
   ajeno y que `none` no se convierta en `{}`.
