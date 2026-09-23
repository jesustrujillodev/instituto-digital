# ADR 0016 · Evaluación por módulo del temario

**Estado:** aceptado · 2026-09-22
**Contexto del cambio:** MVP-02 · evaluaciones en el contenido de los autogestivos
**Extiende:** [ADR-0015](./0015-cuestionarios-autocalificados.md) (un tercer uso de
`quizzes`) y [ADR-0014](./0014-avance-por-leccion-y-completado-por-participante.md)
(qué mide el avance)

## 1. Contexto

Las evaluaciones de seguimiento ([ADR-0010](./0010-evaluaciones-por-curso.md)) se
anclan a una sesión o a nada. Un autogestivo no tiene sesiones, así que todas sus
evaluaciones quedan sin anclar, y además son documentales: no cuentan para el
completado.

Lo que se pidió es otra cosa: que cada **módulo** del temario pueda llevar una
evaluación que el participante presenta él mismo y que hay que aprobar para
completar el curso. Las decisiones del cliente:

- Es un cuestionario de opción múltiple, autocalificado.
- Se presenta **cuando se quiera**, no al terminar las lecciones del módulo.
- Hay un intento, y la calificación queda registrada.
- **Aprobarla es obligatorio** para completar el curso.
- Si alguien la reprueba, **quien imparte le habilita otro intento**.
- Es un **término independiente**: no depende de «Requiere evaluación» y convive con
  el examen final o con la captura manual.
- Se arma **en el temario**, desde el módulo.
- Vale en **cualquier curso con temario**, no solo en los autogestivos.
- Se puede añadir o archivar **después de publicar**, igual que una lección.

## 2. Decisiones

### 2.1 Un tercer dueño en `quizzes`, no una tabla nueva

`quizzes.module_id` se suma a `lesson_id`, y el dueño decide qué es cada fila:

| `lesson_id` | `module_id` | Uso |
| --- | --- | --- |
| nulo | nulo | Examen final |
| valor | nulo | Práctica de una lección `QUIZ` |
| nulo | valor | Evaluación del módulo |

El banco, la calificación, el barajado y la proyección sin respuesta correcta son
exactamente los de ADR-0015, y reutilizarlos es la razón de no crear otra tabla. Todo
el servicio pregunta por un `QuizOwnerRef` (`lessonDocumentId`, `moduleDocumentId`) y
`quizKindOf` lo convierte en `FINAL | PRACTICE | MODULE`. Una frontera que nombre los
dos a la vez se rechaza en la validación.

Hay **a lo sumo una evaluación activa por módulo**. Como el examen final, no se expresa
con un índice parcial: la impone el servicio con la fila del curso bloqueada
(`lockCourseSeats`).

### 2.2 Aprobarla cuenta como contenido, y `teaching` no se entera

La evaluación del módulo entra en el **mismo porcentaje** que las lecciones:
`measuredItemsOf` suma las lecciones medidas y las evaluaciones de módulo con
preguntas, y solo cuenta la aprobada. Así, `contentCompletedAt` —y con él
`isCompleted` y el crédito— ya no se fija hasta que todas estén aprobadas.

La alternativa era un cuarto término en `isCompleted` (`modulesOk`). Se descartó
porque obligaba a `teaching` a leer cuestionarios y a mantener otra columna de
caché. Así, `teaching` sigue sin saber nada de lecciones (ADR-0014 §2.2), y
`progressSync` sigue siendo la única vía que escribe el avance.

Consecuencias que se asumen:

- **Solo cuenta donde cuenta el contenido** (`CONTENT` o `BOTH`). En un curso
  `ATTENDANCE`, el temario es material de apoyo y su evaluación también.
- **El examen final espera también a las evaluaciones de módulo**, porque espera a
  `contentCompletedAt` (ADR-0015 §2.6).
- Con `BOTH`, un curso con sesiones lo cuenta al cierre, como el resto del contenido.

### 2.3 Se presenta cuando se quiera

`quizAvailabilityOf` solo bloquea el examen final. La evaluación de un módulo está
disponible desde la inscripción, aunque falten las lecciones de ese módulo.

### 2.4 Otro intento: sobre el intento, no con una tabla de permisos

`quiz_attempts` pasa de `@@unique([quiz_id, user_id])` a
`@@unique([quiz_id, user_id, number])`, con `number` desde 1. Habilitar otro intento
marca el último con `retake_granted_at` y `retake_granted_by_id`:

- Un intento **sin** `retake_granted_at` cierra el cuestionario (`TAKEN`).
- Uno **con** él lo reabre: el siguiente envío es `number + 1`.
- La unicidad por número sigue siendo la última defensa contra dos envíos
  simultáneos (P2002 → `CONTENT_QUIZ_ALREADY_TAKEN`).

`assertRetakeGrantable` solo acepta el **último** intento, **reprobado** y **sin**
otro ya habilitado. Uno aprobado no se repite, porque su nota ya respalda el avance.
Como un intento aprobado nunca se reabre, «aprobó alguno» equivale a «aprobó el
último», y `findPassedModuleQuizzes` puede buscar cualquier intento aprobado.

El examen final y la práctica no cambian: nadie les habilita otro intento, así que
se quedan en `number = 1`.

**Quién lo habilita:** el alcance de impartición (`resolveTeachingScope`), el mismo
que captura resultados y evaluaciones, y solo en un curso **publicado**: fuera de él
nadie podría presentarlo. Se hace en la pestaña **Avance** de Impartición.

### 2.5 Se archiva, no se borra

`quizzes.archived_at` solo lo usa la evaluación de módulo. Sus intentos respaldan
completados ya otorgados, así que no se borran.

- **Crearla** en un curso publicado recalcula a todo inscrito: el porcentaje baja.
  `contentCompletedAt` no se borra (ADR-0014 §2.3), así que nadie pierde su
  completado ni su crédito.
- **Archivarla** también recalcula, y puede completar a quien solo le faltaba ella.
- **Archivar el módulo** exige archivar antes su evaluación
  (`CONTENT_MODULE_HAS_QUIZ`), igual que sus lecciones.

### 2.6 El aula la recorre como una parada más

El recorrido del aula deja de ser una lista de lecciones: es una lista de
**paradas** (`ClassroomStop`), donde cada módulo termina con su evaluación si tiene
preguntas. De ahí salen «Continuar» (`resumeStopOf`: lo primero que cuenta y falta)
y Anterior/Siguiente (`neighborsOf`). La evaluación se nombra por su módulo, que es lo
que va en la URL (`/aula/modulo/:moduleDocumentId`).

## 3. Consecuencias

- **Esquema**: `quizzes.module_id` y `quizzes.archived_at`;
  `quiz_attempts.number`, `retake_granted_at` y `retake_granted_by_id`; la unicidad
  de intentos gana `number`. Todo con default o nullable: ningún curso anterior
  cambia.
- **Cradle**: `progressSync` gana `quizRepository`. El puerto del repositorio gana
  `archive`, `grantRetake`, `findPassedModuleQuizzes`, `findTeachingCourse`,
  `findModuleQuizzes`, `findLatestModuleAttempts` y `findEnrolledUserId`.
- **Firma**: `findBank` y `findView` reciben un `QuizOwnerRef` en lugar de un
  `lessonDocumentId`. `FINAL_QUIZ_OWNER` nombra el examen final.
- **Fuera de alcance**: un tope de intentos, el historial de intentos en pantalla y
  ponderar módulos. Quien imparte ve solo el último intento de cada persona.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Archivar un módulo con su evaluación activa | `CONTENT_MODULE_HAS_QUIZ` |
| Presentar de nuevo sin otro intento habilitado | `CONTENT_QUIZ_ALREADY_TAKEN` |
| Habilitar otro intento sobre uno aprobado, sin presentar, ya reabierto, o fuera de un curso publicado | `CONTENT_QUIZ_RETAKE_NOT_ALLOWED` |
| Habilitar otro intento a quien ya no está inscrito | `CONTENT_QUIZ_PARTICIPANT_NOT_FOUND` |
| Un módulo que no existe, está archivado o es de otro curso | `CONTENT_MODULE_NOT_FOUND` |
| Una frontera que cuelga el cuestionario de una lección y de un módulo | Validación de frontera |
