# ADR 0010 · Evaluaciones múltiples por curso

**Estado:** aceptado · 2026-09-17
**Contexto del cambio:** evaluaciones del curso (§6.8)

## 1. Contexto

La captura de resultados de PRD-06 guarda el veredicto en la inscripción:
`org.enrollments.result` más `grade`, con `@@unique([course_id, user_id])`. Ese
modelo tiene un techo estructural: **una fila por persona y curso**, es decir un
solo veredicto. No cabe "Práctica 1", "Examen parcial" y "Proyecto final".

Las sesiones tampoco ayudan: `CourseSession` solo sostiene el pase de lista
(`course_attendance`) y no conoce el concepto de evaluar.

El cuestionario en línea sigue fuera del MVP (M6). Lo que se pide es más
modesto: que quien imparte pueda abrir tantas evaluaciones como necesite y
capturar, por persona, aprobado / no aprobado y una observación en texto.

## 2. Decisiones

### 2.1 Entidad propia, no más columnas en `enrollments`

`org.course_evaluations` (una fila por evaluación del curso) y
`org.evaluation_results` (una por evaluación y persona, con PK compuesta). La
alternativa —más columnas en `enrollments`— sería un `grade2`, `grade3` sin
final, y la unicidad por curso seguiría impidiendo la enésima.

### 2.2 La sesión es opcional

`course_evaluations.session_id` es nullable. Hay evaluaciones que corresponden a
un día ("Práctica de la sesión 2") y otras que no ("Proyecto final"). Atarlas
siempre a una sesión obligaría a inventar sesiones falsas.

La FK es `onDelete: SetNull` y no `Cascade`: editar un curso recrea sesiones, y
eso no puede llevarse por delante evaluaciones ya capturadas. La evaluación se
queda sin día, que es información menor comparada con perder las capturas.

### 2.3 `passed Boolean?` y la ausencia de fila como "sin capturar"

No se declara un enum nuevo. `EnrollmentResult.PENDING` significa otra cosa —el
veredicto final del curso que bloquea el cierre— y reusarlo aquí confundiría dos
conceptos.

El patrón es el de `course_attendance`: **si no hay fila, no se capturó nada**.
`passed` sí es nullable porque la observación puede llegar antes que el
veredicto ("falta que entregue el reporte"), y ese texto necesita una fila donde
vivir. Vaciar los dos campos borra la fila y devuelve a "sin capturar".

### 2.4 El veredicto final sigue siendo manual

Las evaluaciones son **documentales**. No tocan `isCompleted`, ni
`finishBlockerOf`, ni el pipeline de créditos de
[0006](./0006-imparticion-creditos-y-valoracion.md). El crédito lo sigue dando
el resultado de la pestaña Resultados, capturado a mano.

Consecuencia aceptada: se puede finalizar un curso con evaluaciones a medio
capturar. Lo único que bloquea el cierre es un veredicto final en `PENDING`.

La alternativa —derivar el veredicto de "aprobó todas"— obligaría a decidir qué
pasa con las evaluaciones opcionales, con las ponderaciones y con quien se
incorpora a mitad del curso. Nada de eso está en el alcance MVP.

### 2.5 Módulo propio sin dueño compartido

`app/modules/evaluations` es dueño único de sus dos tablas, como `ratings` lo es
de `course_ratings`. Autoriza reutilizando las piezas puras del alcance de
impartición (`resolveTeachingScope`, `teachingCourseWhere`, `canWrite`), pero
lanza **sus** errores: un `TEACHING_CORRECTION_FORBIDDEN` dentro del envelope de
evaluations obligaría al adaptador a cargar dos diccionarios de mensajes.

Su ruta es solo action (`/dashboard/imparticion/:documentId/evaluaciones`),
igual que `ratings/routes/valorar`. Así el action de la ficha no crece y el
tablero llega por el loader de teaching, que ya hace lo mismo con las
valoraciones.

### 2.6 Interno de quien imparte

Ninguna proyección del participante selecciona `evaluation_results`. El alumno
sigue viendo en "Mis cursos" su resultado final y su nota, no el desglose ni las
observaciones. La confidencialidad empieza en la consulta, igual que el
anonimato de los comentarios de valoración.

### 2.7 Diff en el envío, transacción en la escritura

`resolveCaptureWrites` descarta lo que no cambia, para que `recorded_by` diga
quién hizo el último cambio y no quién pulsó guardar después. Altas, cambios y
bajas del mismo envío van en una transacción: o entra entero o no entra.

No hay `FOR UPDATE` sobre el curso porque nada de esto recalcula créditos —el
motivo por el que §4 de 0006 lo exige.

## 3. Consecuencias

- Dos tablas nuevas y un módulo más en el cradle.
- La pestaña Evaluaciones aparece con la misma condición que Resultados
  (`course.requiresEvaluation`), así que un curso sin evaluación no la ve.
- Quien corrige un curso finalizado puede editar y borrar evaluaciones; el
  capacitador, no. Misma matriz que el resultado final, sin regla nueva.
- Queda pendiente, si algún día se pide: derivar el veredicto final, ponderar
  evaluaciones y mostrarle el desglose al participante.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| El curso no existe o cae fuera del alcance | `EVALUATION_COURSE_NOT_FOUND` |
| La evaluación no es de ese curso | `EVALUATION_NOT_FOUND` |
| La sesión elegida no es de ese curso | `EVALUATION_SESSION_NOT_FOUND` |
| Escribir en un curso finalizado sin ser quien corrige | `EVALUATION_FORBIDDEN` |
| Alguien del envío ya no está inscrito | `EVALUATION_UNKNOWN_PARTICIPANT` |
| El curso llegó al tope de evaluaciones | `EVALUATION_TOO_MANY` |
