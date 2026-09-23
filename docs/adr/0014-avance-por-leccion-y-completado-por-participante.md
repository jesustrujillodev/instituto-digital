# ADR 0014 · Avance por lección, caché de porcentaje y completado por participante

**Estado:** aceptado · 2026-09-22
**Contexto del cambio:** MVP-02 · F-05, el aula del participante
**Sustituye en parte a:** [ADR-0011](./0011-formato-de-curso-y-regla-de-completado.md)
§2.3 (`BOTH`), §2.4 (evaluación obligatoria con `CONTENT`) y §2.8 (cierre del
autogestivo)

## 1. Contexto

[ADR-0013](./0013-material-de-la-leccion.md) dejó cada lección con su material y
el pendiente escrito: «nadie escucha todavía el `ended` del reproductor, no
existe `lesson_progress` y `isCompleted` no ha cambiado».

Tres consecuencias de ese hueco:

1. La rama `CONTENT` de `isCompleted` solo mira el resultado capturado a mano. Un
   autogestivo se completa por su evaluación, no por su contenido, y por eso
   ADR-0011 §2.4 exigió la evaluación como restricción temporal.
2. El autogestivo se **finaliza** como un curso con sesiones: alguien tiene que
   decidir cuándo se cierra, y el crédito sale en ese cierre. Un curso a ritmo
   propio que espera a que alguien lo cierre no es un curso a ritmo propio.
3. «Mis cursos» es un listado. No hay dónde leer el material.

## 2. Decisiones

### 2.1 Un autogestivo no se finaliza: cada quien lo completa

El crédito de un autogestivo se otorga **a cada participante en el momento en que
completa**, no en un cierre. `finishBlockerOf` devuelve `SELF_PACED` antes que
cualquier otra comprobación, y `finish` lo rechaza con
`TEACHING_SELF_PACED_NOT_FINISHABLE`.

Lo que quien imparte sí controla es la **entrada**: `courses.enrollment_closed_at`
es un interruptor que cierra y reabre las inscripciones. Cerrado, el curso sale
del catálogo y `isEnrollmentOpen` es falso, pero quien ya estaba inscrito sigue
avanzando y completa cuando termine. Solo un autogestivo publicado lo usa
(`TEACHING_NOT_SELF_PACED` en otro caso): un curso con sesiones ya cierra al
empezar.

Los cursos con sesiones (`ATTENDANCE` y `BOTH`) no cambian: se finalizan y
acreditan en el cierre, como siempre.

### 2.2 Una sola sincronización del completado, y quién la dispara

`syncCompletion` sale del servicio de impartición a `completionSync`
(`teaching/application/completion-sync.server.ts`), registrado en el cradle con su
puerto `ICompletionSync`. Es el mismo cuerpo —recalcular quién completó y dejar los
créditos igual que el cálculo con `diffCredits`— con más puntos de entrada:

| Quién escribe | Cuándo sincroniza |
| --- | --- |
| `finish` | Siempre (curso con sesiones) |
| `saveAttendance`, `saveResults` | Si `syncsOnWrite`: finalizado (corrección) **o autogestivo publicado** |
| El aula, al completar una lección | Si alguien terminó el contenido y `syncsOnWrite` |
| El temario, al crear, archivar o cambiar `isRequired` | Igual |

El último dato que falta es el que otorga el crédito. Si el curso exige
evaluación, puede llegar primero el contenido y después el resultado, o al revés.
Cualquiera de los dos órdenes acaba en la misma función.

**El ejercicio del crédito no necesitó código.** `fiscalYearOf` cae en `at` cuando
el curso no tiene sesiones, y `at` es ahora el momento en que la persona
completa. Un crédito restaurado por una corrección toma el año de la corrección,
que es cuando la persona vuelve a cumplir.

La dependencia va `content → teaching`, por un puerto y sin ciclo: `teaching` no
sabe nada de lecciones.

### 2.3 El completado se lee de `contentCompletedAt`, que no se borra

`isCompleted` pasa a ser una conjunción de términos:

```
attendanceOk = !countsAttendance(rule) || meetsAttendance(...)
contentOk    = !countsContent(rule)    || contentCompletedAt !== null
evaluationOk = !requiresEvaluation     || result === "PASSED"
```

`ATTENDANCE` queda **idéntica** a la de antes, y una prueba de no-regresión lo fija.

`enrollments.content_completed_at` se fija la primera vez que el porcentaje llega
a 100 y **no se borra**. Si quien imparte añade después una lección obligatoria,
el porcentaje baja, pero nadie pierde un completado ni un crédito por algo que no
existía cuando terminó. Quien todavía no había terminado sí tiene que hacer la
lección nueva.

### 2.4 `BOTH` y la relajación de ADR-0011 §2.4

- **`BOTH`** (asistencia y contenido) existe ya, porque ya hay contenido que contar.
  Solo vale con `SCHEDULED`: `assertCompletionRuleCoherent` rechaza cualquier regla
  que cuente asistencia en un curso sin sesiones.
- **`CONTENT` ya no exige evaluación.** Se borra `COURSE_COMPLETION_RULE_WITHOUT_EVALUATION`.
  La evaluación pasa a ser un término opcional más.
- **`requiresContent` recibe el curso, no el formato**: un autogestivo o un curso con
  regla `BOTH`. Eso decide el paso Contenido del alta (`stepsFor`), el pendiente
  «al menos una lección» y el botón al temario del curso publicado.

### 2.5 En un autogestivo publicado se congelan la regla y la evaluación

Sus créditos se otorgan conforme cada quien completa. Cambiar la regla o la
evaluación a mitad del camino dejaría medidos con un criterio los créditos ya
otorgados y con otro los que faltan. `assertCompletionSettingsEditable` lo rechaza
con `COURSE_COMPLETION_LOCKED`, igual que ADR-0011 §2.5 congeló el formato.

Un curso con sesiones las sigue pudiendo cambiar: todo se calcula en el cierre.

### 2.6 El avance: filas por lección y un porcentaje en caché

- **`lesson_progress`**, PK `(lesson_id, user_id)`, con `status` `IN_PROGRESS |
  COMPLETED`. No tener fila significa «sin empezar», con el mismo criterio que
  `course_attendance`.
- **No hay `watched_seconds`.** El avance es por clase, no por minutos (ADR-0013
  §2.4): un video se marca al dispararse `ended`, y `TEXT`, `FILE` y `LINK` con un
  botón. Un video sin archivo también se marca a mano, porque de otro modo no
  terminaría nunca. No se puede desmarcar: `nextProgressStatus` nunca baja de
  `COMPLETED`.
- **Abrir una lección no se registra en el loader.** Precargar el enlace no debe
  contar como haberla abierto, así que se envía con un POST al montar la lección.
- **`enrollments.progress_percent` es caché.** Lo escribe una única vía,
  `progressSync.recalculate`, dentro de la transacción de quien escribe y con la
  fila del curso bloqueada (el mismo `FOR UPDATE` que la impartición). La pantalla
  del aula lo recalcula en vivo. El caché solo existe para los listados.
- **Qué se mide.** Las lecciones obligatorias. Si no hay ninguna, se mide el
  temario entero, para que «todo opcional» no signifique «terminado sin abrir
  nada». Un temario vacío da 0 y nunca completa. El porcentaje es entero y hacia
  abajo, con el criterio de `attendancePercent`: solo vale 100 cuando no falta
  ninguna.
- **Cambiar el temario recalcula.** Crear una lección, archivarla o cambiar su
  `isRequired` en un curso publicado recalcula a todo inscrito en la misma
  transacción. Archivar la última obligatoria pendiente puede completar a alguien
  y otorgarle su crédito.

### 2.7 El aula

`/dashboard/mis-cursos/:documentId/aula` tiene el índice lateral como layout y un
índice que redirige a la lección de «Continuar»: la primera obligatoria sin
completar, luego la primera sin completar y, con todo hecho, la primera del
temario. Sale de las filas de avance, así que retoma igual en cualquier
dispositivo.

- **Quién entra.** El aula se abre a la inscripción activa de un curso publicado o
  finalizado. Sin inscripción activa la respuesta es `CONTENT_NOT_ENROLLED`, y la
  impone el servicio: esconder el botón no protege de un POST directo. Un curso
  finalizado se sigue leyendo, pero ya no registra avance
  (`CONTENT_CLASSROOM_READ_ONLY`).
- **Material de apoyo.** El aula existe siempre que el curso tenga lecciones
  activas, también en un curso con regla `ATTENDANCE`. Ahí el avance se registra
  pero no cuenta, y la pantalla lo dice.
- **Lectura del material.** Se firma en `lessonMaterialReader`, que comparten el
  panel de quien edita y el aula.

### 2.8 Lo que cambia alrededor

- **Mis cursos.** Barra de avance cuando el contenido cuenta, y «Entrar al aula»,
  «Continuar» o «Repasar». Un autogestivo completado pasa a **Finalizados** y ya
  no se abandona (`canWithdraw`), porque su crédito quedaría sin inscripción que lo
  respalde.
- **Valoración.** Un autogestivo se valora al quedar completada la inscripción. Un
  curso con sesiones sigue exigiendo que esté finalizado y haber asistido.
- **Impartición.** En un autogestivo, la tarjeta de cierre se sustituye por la de
  inscripciones. Aparece una pestaña **Avance** cuando el curso tiene temario que
  cuenta, y Completado enseña lo ya guardado, no una previsión.

## 3. Consecuencias

- Una tabla (`lesson_progress`), un enum, dos columnas en `enrollments`, una en
  `courses` y un valor en `CourseCompletionRule`. Todo con default o nullable:
  ningún curso anterior cambia de comportamiento.
- El cradle gana `completionSync`, `progressSync`, `lessonMaterialReader`,
  `classroomRepository` y `classroomService`. `createContentService` gana
  `lessonMaterialReader` y `progressSync`.
- Los pasos 10 a 12 de la verificación manual de F-01, que finalizaban un
  autogestivo, dejan de valer: ahora se rechaza.
- Queda fuera: exigir material para publicar (ADR-0013 §3). Un temario con una
  lección vacía se completa marcándola a mano.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Finalizar un autogestivo | `TEACHING_SELF_PACED_NOT_FINISHABLE` |
| Abrir o cerrar a mano las inscripciones de un curso con sesiones | `TEACHING_NOT_SELF_PACED` |
| Cambiar la regla o la evaluación de un autogestivo publicado | `COURSE_COMPLETION_LOCKED` |
| Un autogestivo con una regla que cuenta asistencia (`ATTENDANCE`, `BOTH`) | `COURSE_INCOMPATIBLE_COMPLETION_RULE` |
| Registrar avance sin inscripción activa | `CONTENT_NOT_ENROLLED` |
| Registrar avance en un curso finalizado | `CONTENT_CLASSROOM_READ_ONLY` |
| Un estado de avance que no es `IN_PROGRESS` ni `COMPLETED` | Validación de frontera |
