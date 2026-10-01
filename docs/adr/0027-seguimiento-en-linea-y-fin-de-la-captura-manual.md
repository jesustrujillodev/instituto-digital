# ADR 0027 · Seguimiento en línea por sesión y fin de la captura manual

**Estado:** aceptado · 2026-10-01
**Contexto del cambio:** MVP-02 · rediseño del paso Evaluación
**Sustituye:** [ADR-0010](./0010-evaluaciones-por-curso.md) (evaluaciones de seguimiento
documentales)
**Enmienda:** [ADR-0015](./0015-cuestionarios-autocalificados.md) §2.3 y §2.4 (método de
evaluación y captura manual) y [ADR-0024](./0024-intentos-configurables-y-calificacion-minima-del-curso.md)
§2.4 (qué entra al promedio y cuándo se escribe el resultado)

## 1. Contexto

Había dos formas de evaluar: la captura manual (aprobado o no aprobado, escrito por quien
imparte) y el examen en línea. El cliente decide que **solo se evalúa con exámenes dentro de la
plataforma**. Además pide evaluar durante las sesiones, presenciales o por videollamada: un
cuestionario que el participante presenta en la misma pantalla en la que registra su asistencia.

## 2. Decisiones

### 2.1 No hay captura manual

- Se eliminan `course_evaluations`, `evaluation_results` y el módulo `evaluations`.
- Se eliminan `courses.evaluation_method` y el enum `EvaluationMethod`. «Requiere evaluación
  final» significa examen en línea: `evaluatesByQuiz(curso) = curso.requiresEvaluation`.
- La pestaña Resultados de Impartición queda de solo lectura: muestra lo que escriben el examen
  y el temario. Desaparecen `saveResults` y el bloqueo de cierre por resultados pendientes.

### 2.2 La evaluación de seguimiento es un cuestionario de una sesión

`quizzes.session_id` es el cuarto dueño de un cuestionario:

| Dueño | Uso |
| --- | --- |
| `lesson_id` | Práctica de una lección |
| `module_id` | Evaluación de un módulo |
| `session_id` | Seguimiento de una sesión (`FOLLOW_UP`) |
| ninguno | Examen final |

Una sesión puede tener varios. Se identifican por el `documentId` del propio cuestionario. Solo
existen en cursos calendarizados: dependen del pase de lista de la sesión, y un autogestivo no
lo tiene. Tope por curso: `FOLLOW_UPS_PER_COURSE_LIMIT` (20).

Columnas propias, nulas fuera del seguimiento:

| Columna | Qué guarda |
| --- | --- |
| `counts_toward_grade` | Si su nota entra a la calificación de la capacitación |
| `availability` | `SESSION_START`, `SESSION_END`, `RANGE` o `MANUAL` |
| `opens_before_minutes` | Minutos antes del inicio (`RANGE`) |
| `closes_after_minutes` | Minutos después del fin (`SESSION_END`, `RANGE`) |
| `opened_at`, `closed_at` | Apertura y cierre a mano (`MANUAL`) |

### 2.3 Cuándo se presenta

`followUpWindowOf`:

| Modo | Abre | Cierra |
| --- | --- | --- |
| Al iniciar la sesión | `startsAt` | `endsAt` |
| Al terminar la sesión | `endsAt` | `endsAt + closes_after` |
| Rango | `startsAt − opens_before` | `endsAt + closes_after` |
| Manual | `opened_at` | `closed_at` |

Todos cierran también al finalizar la capacitación. En modo manual, quien imparte abre y cierra
desde la pestaña Evaluaciones de Impartición. Cerrar es definitivo.

Presentarlo **exige asistencia registrada en esa sesión**. Aparece en la pantalla del QR tras
registrar la asistencia, y también en el detalle de Mis capacitaciones, con la misma ventana. Así
el modo «al terminar» funciona aunque el escaneo ya haya cerrado.

`followUpAvailabilityOf` añade a las reglas de intentos de ADR-0024 tres estados propios:
`NOT_YET`, `CLOSED` y `NOT_ATTENDED`.

### 2.4 Calificación

`courseScoresOf` reúne todo lo que entra al promedio:

- la mejor nota de cada evaluación del temario que cuenta (`countedScoresOf`);
- la mejor nota del examen final;
- de cada seguimiento con `counts_toward_grade`: la mejor nota, o **0 si su ventana ya cerró sin
  intento**. Mientras siga abierta, no entra.

Un seguimiento que no cuenta se califica, pero solo como referencia de quien imparte.

`gradesAutomatically` se amplía: examen final, temario que cuenta, **o al menos un seguimiento
que cuenta**. Ese último dato es del módulo de contenido y llega como hecho
(`CourseContentFacts.countedFollowUpCount`).

El resultado se sigue escribiendo por `enrollmentRepository.saveResults`:

- en cada envío, como hoy;
- también tras un seguimiento, si la persona ya tiene nota;
- **al finalizar**, para todos, con los ceros aplicados (`progressSync.recalculateCourse`), antes
  de `completionSync`.

La acreditación sigue siendo compensatoria. Quien no presentó el examen final sigue quedando
`FAILED` al cerrar.

La nota queda fija cuando se otorga el crédito (`completed`), ya no con el primer `PASSED`. En
un autogestivo es lo mismo, porque acredita en el acto. En un calendarizado, el resultado es
provisional hasta el cierre: si alguien aprueba el examen final y luego deja sin presentar un
seguimiento que cuenta, su nota baja.

### 2.5 Bajas

- Un seguimiento con intentos no se elimina: `CONTENT_FOLLOW_UP_HAS_ATTEMPTS`.
- Quitar en la edición una sesión cuyo seguimiento tiene intentos se rechaza:
  `COURSE_SESSION_HAS_ATTEMPTS`. Sin intentos, el seguimiento cae en cascada con la sesión.

### 2.6 Publicar

Cada seguimiento necesita al menos una pregunta. Si no, queda el pendiente `followUps`.

## 3. Consecuencias

- **Esquema** (vía `db push`): fuera las dos tablas, el enum y la columna; siete columnas nuevas
  en `quizzes` y el enum `QuizAvailabilityMode`.
- **Relleno único**, que se corre antes del `db push`. Los datos manuales eran de prueba:

  ```sql
  DELETE FROM org.evaluation_results;
  DELETE FROM org.course_evaluations;
  UPDATE org.courses SET requires_evaluation = false WHERE evaluation_method = 'MANUAL';
  ```

  Los resultados ya escritos en `enrollments` se conservan.
- Toda consulta del examen final suma `session_id: null` a `lesson_id: null, module_id: null`.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Seguimiento en una sesión de otro curso | `CONTENT_SESSION_NOT_FOUND` |
| Seguimiento en un autogestivo | `CONTENT_FOLLOW_UP_SELF_PACED` |
| Más de 20 por curso | `CONTENT_TOO_MANY_FOLLOW_UPS` |
| Eliminar uno con intentos | `CONTENT_FOLLOW_UP_HAS_ATTEMPTS` |
| Presentarlo fuera de su ventana | `CONTENT_FOLLOW_UP_NOT_OPEN` |
| Presentarlo sin asistencia en la sesión | `CONTENT_FOLLOW_UP_NOT_ATTENDED` |
| Abrir o cerrar uno que no es manual, o ya cerrado | `CONTENT_FOLLOW_UP_NOT_MANUAL`, `CONTENT_FOLLOW_UP_CLOSED` |
| Quitar una sesión cuyo seguimiento tiene intentos | `COURSE_SESSION_HAS_ATTEMPTS` |
