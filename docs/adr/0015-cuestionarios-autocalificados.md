# ADR 0015 · Cuestionarios autocalificados y convivencia con la evaluación manual

**Estado:** aceptado · 2026-09-23
**Contexto del cambio:** MVP-02 · F-06, los cuestionarios

## 1. Contexto

Hasta ahora el resultado de un curso solo se escribía a mano: quien imparte
captura aprobado o no aprobado, con su nota, en la pestaña Resultados
(`teachingService.saveResults`). Las evaluaciones de seguimiento
([ADR-0010](./0010-evaluaciones-por-curso.md)) son documentales y no tocan ese
resultado.

Un autogestivo que exige evaluación se completa en vivo
([ADR-0014](./0014-avance-por-leccion-y-completado-por-participante.md)), pero
depende de que alguien capture su resultado. Si nadie lo hace, el curso no se
completa aunque la persona haya terminado todo.

F-06 añade dos cosas: el **examen en línea**, que escribe el resultado solo, y el
**cuestionario de práctica**, que forma parte del temario.

## 2. Decisiones

### 2.1 Dos usos, una misma tabla

| Uso | Dónde vive | Qué hace al enviarse |
| --- | --- | --- |
| **Examen final** | `quizzes.lesson_id` nulo. Uno por curso | Escribe `Enrollment.result` y `grade` |
| **Práctica** | `quizzes.lesson_id` apunta a una lección `QUIZ` | Completa la lección, apruebe o no |

La práctica no evalúa: enviarla completa la lección y solo cuenta para el avance.
El examen es la evaluación del curso.

Hay un solo examen por curso. No se expresa con un índice parcial: lo impone el
servicio con la fila del curso bloqueada (`lockCourseSeats`).

### 2.2 Un solo intento

`quiz_attempts` tiene `@@unique([quiz_id, user_id])` y no hay `allowedAttempts`:
el cliente no pidió más de un intento. Si dos envíos llegan a la vez, el segundo
choca con la unicidad (P2002) y el repositorio lo traduce a
`CONTENT_QUIZ_ALREADY_TAKEN`.

El intento se crea **al enviar**, sin «empezar»: no hay tiempo límite que medir.

### 2.3 El método de evaluación es explícito y se congela al publicar

`courses.evaluation_method` puede ser `MANUAL` o `QUIZ` y solo aplica con
`requires_evaluation`. `evaluatesByQuiz(course)` es la única pregunta que hacen
los demás módulos.

Se congela al publicar, en cualquier formato (`COURSE_COMPLETION_LOCKED`):
pasar de captura a examen a mitad dejaría resultados medidos de dos formas.

Un curso que evalúa por examen no se publica sin examen con al menos una pregunta
(pendiente `quiz`, `COURSE_WITHOUT_QUIZ`), porque todo inscrito quedaría en
pendiente.

### 2.4 Una sola vía para el resultado

- El examen escribe por `enrollmentRepository.saveResults`, **la misma vía que la
  captura manual**, y quien lo firma es quien lo presentó.
- En un curso evaluado por examen no hay captura manual: `resolveResultEntries`
  la rechaza con `TEACHING_RESULTS_BY_QUIZ`, también en las correcciones, y la
  pestaña Resultados queda de solo lectura. Si hubiera dos vías sobre el mismo
  dato, la última escritura ganaría sin que nadie supiera cuál fue.
- Un pendiente no bloquea el cierre (`pendingResultsOf` = 0). Al finalizar un
  curso con sesiones, quien no presentó el examen pasa a `FAILED` sin nota
  (`markPendingAsFailed`), y la pantalla lo enseña como «No presentó». Un
  autogestivo no se cierra y lo deja pendiente.
- El crédito sale de `completionSync`, como siempre. En un autogestivo el examen
  acredita al momento; en uno con sesiones, cuenta al cierre.

### 2.5 La respuesta correcta nunca viaja al participante

- `toQuizSheet` proyecta sin `isCorrect`.
- Después de enviar, `toQuizOutcome` dice qué preguntas se acertaron, pero no cuál
  era la opción correcta: así las respuestas no circulan.
- Si el examen se baraja, la semilla es el cuestionario y la persona, así que
  recargar no cambia el orden.

### 2.6 Cuándo se presenta

| Caso | Disponible |
| --- | --- |
| Examen, en un curso que cuenta contenido | Al terminar las lecciones obligatorias (`LOCKED_BY_CONTENT` hasta entonces) |
| Examen, en un curso que no cuenta contenido | Desde la inscripción, mientras el curso siga publicado |
| Práctica | Siempre |

El aula aparece también en un curso que evalúa por examen aunque no tenga
lecciones: es donde se presenta. Su índice lleva el examen al final, con su
estado.

### 2.7 El banco se guarda entero y se congela con el primer intento

El editor manda el banco completo (título, calificación mínima, barajar, y las
preguntas con sus opciones en orden) y el servidor reescribe preguntas y
opciones en una transacción. Eso solo es posible porque el banco no se edita
cuando ya tiene intentos (`CONTENT_QUIZ_LOCKED`), y así no hacen falta intents
por pregunta ni un reordenamiento aparte. El título se corrige siempre, con
`rename-quiz`.

### 2.8 Calificación en enteros

`score = floor(puntos_acertados × 100 / puntos_totales)` y
`passed = score ≥ passingScore`. Hay que responder todas las preguntas, y cada
opción tiene que ser de su pregunta (`CONTENT_QUIZ_INCOMPLETE`).

Tipos de pregunta:
- `SINGLE_CHOICE`: de 2 a 6 opciones, exactamente una correcta.
- `TRUE_FALSE`: las opciones «Verdadero» y «Falso» las fija el servidor.

No hay respuesta abierta: exigiría calificación manual, que es justo lo que ya
existe.

### 2.9 Sub-dominio de `content`, no módulo nuevo

La práctica es una lección y el examen se presenta en el aula. Con un módulo
aparte, `content` tendría que leer tablas ajenas (el `hasMaterial` de una lección
`QUIZ`) o se crearía un ciclo entre módulos. Se sigue el precedente del aula
(ADR-0014). Quién arma el cuestionario sale de `createContentCourseGate`: el
mismo alcance de escritura que el temario y que las evaluaciones de seguimiento.

### 2.10 El editor vive en el paso Evaluación del wizard

Igual que las evaluaciones de seguimiento, el examen se arma en el paso 4 del
alta y de la edición (`/nuevo/4`, `/editar/4`), como un *slot* que guarda por su
cuenta y no viaja en el payload del curso. La práctica se arma desde el panel de
la lección en el temario. Las dos escriben contra
`/dashboard/cursos/:documentId/cuestionario`.

## 3. Consecuencias

- **Esquema**: cinco tablas (`quizzes`, `quiz_questions`, `quiz_options`,
  `quiz_attempts`, `quiz_answers`), dos enums, `LessonType.QUIZ` y
  `courses.evaluation_method` con default `MANUAL`. Ningún curso anterior cambia.
- **Cradle**: gana `quizRepository` y `quizService`. El aula gana
  `quizRepository`, y `enrollments` gana `markPendingAsFailed`.
- **Lo que no cambia**: las evaluaciones de seguimiento siguen siendo
  documentales y conviven con el examen.
- **Fuera de alcance**: varios intentos, tiempo límite, respuesta abierta,
  ponderación y ver la opción correcta después de enviar.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Publicar un curso evaluado por examen sin examen | `COURSE_WITHOUT_QUIZ` |
| Cambiar el método de evaluación de un curso publicado | `COURSE_COMPLETION_LOCKED` |
| Capturar a mano el resultado de un curso evaluado por examen | `TEACHING_RESULTS_BY_QUIZ` |
| Editar el banco con intentos enviados | `CONTENT_QUIZ_LOCKED` |
| Un segundo intento | `CONTENT_QUIZ_ALREADY_TAKEN` |
| El examen antes de terminar las obligatorias | `CONTENT_QUIZ_NOT_AVAILABLE` |
| Dejar preguntas sin responder, o usar una opción ajena | `CONTENT_QUIZ_INCOMPLETE` |
| El examen de un curso de captura manual | `CONTENT_QUIZ_NOT_EVALUATED` |
| Marcar a mano una práctica con preguntas | `CONTENT_QUIZ_COMPLETES_ON_SUBMIT` |
| Un cuestionario sin preguntas | `CONTENT_QUIZ_NOT_FOUND` |
