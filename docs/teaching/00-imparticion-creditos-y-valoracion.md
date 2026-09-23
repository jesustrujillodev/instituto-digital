# Impartición, créditos y valoración — Referencia

## 1. Qué es

PRD-06 cierra el ciclo del curso en tres módulos:

| Módulo | Entrega | Rutas |
| --- | --- | --- |
| `app/modules/teaching` | §6.8: pase de lista, resultados, cierre y corrección | `/dashboard/imparticion`, `/dashboard/imparticion/:documentId` |
| `app/modules/credits` | §6.9: mis créditos, créditos del personal, créditos por dependencia | `/dashboard/mis-creditos`, `/dashboard/creditos` |
| `app/modules/ratings` | §6.10: valorar y ver el promedio | `/dashboard/mis-cursos/:documentId/valorar` (solo action) |
| `app/modules/evaluations` | §6.8: varias evaluaciones por curso, documentales; aquí solo se capturan, se definen con el curso | `/dashboard/imparticion/:documentId/evaluaciones` (solo action) |

Las decisiones están en [ADR 0006](../adr/0006-imparticion-creditos-y-valoracion.md).

La ficha ofrece **Editar curso** cuando quien imparte también lo administra
(`administersCourse` sobre su alcance de cursos) y el curso sigue editable. La
edición vuelve a la ficha al terminar (`?volver=imparticion`). El capacitador
asignado que no lo creó ve la ficha sin ese botón: imparte, no administra.

Finalizar no toca el plan anual: la línea vinculada pasa a `realizada` sola
porque su estado se deriva del curso ([ADR 0007](../adr/0007-plan-anual-estado-derivado.md)).

Lo que **no** hace todavía:

| Pendiente | PRD |
| --- | --- |
| Constancias en PDF | Fase 2 (§8) |

## 2. El modelo

| Tabla / columna | Qué guarda |
| --- | --- |
| `org.course_attendance` | Una marca por `(session_id, user_id)`: `attended`, `source` (`MANUAL`/`QR`), `recorded_by_id`, `recorded_at` |
| `org.enrollments.grade` | Nota opcional 0–100 |
| `org.course_evaluations`, `org.evaluation_results` | Las evaluaciones del curso y lo capturado en ellas ([referencia](../evaluations/00-evaluaciones.md)) |
| `org.enrollments.completed` | Resultado del último cierre o corrección |
| `org.enrollments.result_recorded_by_id`, `result_recorded_at` | Quién capturó o corrigió el resultado |
| `org.courses.finished_at` | Cuándo se finalizó |
| `org.credits` | Una fila por `(user_id, course_id)`: dependencia al obtenerlo, `fiscal_year`, quién lo otorgó, `revoked_at` y `revoked_by_id` |
| `org.course_ratings` | Una fila por `(course_id, user_id)`: `score` 1–5 y `comment` opcional |

## 3. Pase de lista y resultados

- Se pasa lista **por sesión** a los inscritos `ENROLLED`, desde el inicio del día
  local de la sesión (`isSessionOpen`).
- El envío es la lista completa de la sesión. Solo se escriben las marcas que
  **cambian** (`resolveAttendanceMarks`), para que `recorded_by` diga quién hizo
  el último cambio y no quién pulsó guardar después.
- Los resultados existen solo si el curso `requiresEvaluation`. Una nota
  acompaña a `PASSED` o `FAILED`, nunca a `PENDING`.
- No confundir el **resultado** con las **evaluaciones**. El resultado es uno por
  persona y curso, se captura a mano y es el que otorga el crédito. Las
  evaluaciones son varias, documentales, y no tocan el cierre ni los créditos
  ([ADR 0010](../adr/0010-evaluaciones-por-curso.md)).
- Si alguien del envío ya no está inscrito, se rechaza el envío entero
  (`TEACHING_UNKNOWN_PARTICIPANT`).
- La lista y los resultados viajan como un JSON en el campo `payload`, igual que
  el formulario de cursos.

## 4. Finalizar

```
POST /dashboard/imparticion/:id  intent=finish
  │ requireTeaching → teachingService.finish
  ▼ runInTransaction
  │ lockCourseSeats(course)          FOR UPDATE sobre la fila del curso
  │ findCourseById                   relectura con el bloqueo tomado
  │ assertFinishable                 publicado · con sesiones · en su día · sin pendientes
  │ courseRepository.finish          UPDATE ... WHERE status = 'PUBLISHED'
  │ completionSync.sync              (teaching/application/completion-sync.server.ts)
  │   completedParticipantsOf        según completion_rule (§4.1)
  │   enrollmentRepository.setCompletion
  │   diffCredits(existentes, candidatos)
  │   creditRepository.grant / restore / revoke
  ▼
ok({ completed, credits })
```

| Impedimento | Código |
| --- | --- |
| No está publicado | `TEACHING_NOT_PUBLISHED` |
| Es autogestivo: no se finaliza nunca (§4.2) | `TEACHING_SELF_PACED_NOT_FINISHABLE` |
| Sin sesiones | `TEACHING_WITHOUT_SESSIONS` |
| Antes del día de la última sesión | `TEACHING_FINISH_TOO_EARLY` + `opensAt` |
| Resultados pendientes | `TEACHING_PENDING_RESULTS` + `pending` |
| Otra petición lo finalizó antes | `TEACHING_STATE_CHANGED` |

La ficha calcula el mismo impedimento con `finishBlockerOf` para deshabilitar el
botón con el motivo. El servidor lo vuelve a comprobar con la fila bloqueada.

**El cálculo en enteros.** `meetsAttendance` compara
`asistidas × 100 ≥ mínimo × total`: 2 de 3 sesiones no alcanzan un mínimo de 67 %
y sí uno de 66 %, sin depender del redondeo. Con una sola sesión, el mínimo es
de hecho 100 %.

### 4.1 · Qué cuenta como completar

`isCompleted` es una conjunción de términos que la regla enciende
([ADR 0011](../adr/0011-formato-de-curso-y-regla-de-completado.md),
[ADR 0014](../adr/0014-avance-por-leccion-y-completado-por-participante.md)):

| Regla | Asistencia mínima | Contenido terminado | Solo con Sesiones |
| --- | --- | --- | --- |
| `ATTENDANCE` | Sí | — | Sí |
| `CONTENT` | — | Sí | No |
| `BOTH` | Sí | Sí | Sí |

Y en las tres, si `requires_evaluation`, además el aprobado. «Contenido
terminado» es `enrollments.content_completed_at`, que el avance por lección fija
la primera vez que el porcentaje llega a 100 y **no borra** aunque después se
añada una lección obligatoria.

La rama `ATTENDANCE` es idéntica al comportamiento anterior a la regla, bit a
bit: gobierna todo el histórico y una prueba la fija.

### 4.2 · El autogestivo no se finaliza

Cada participante lo completa cuando cumple, y en ese momento recibe su crédito.
`finishBlockerOf` devuelve `SELF_PACED` y la tarjeta de cierre se sustituye por
la de **inscripciones**:

```
POST /dashboard/imparticion/:id  intent=enrollment-window  payload={ open }
  │ teachingService.setEnrollmentOpen
  ▼ runInTransaction + lockCourseSeats
  │ assertEnrollmentTogglable        autogestivo · publicado
  │ courseRepository.setEnrollmentClosed(at | null)
```

Cerrado, el curso sale del catálogo y nadie nuevo entra; quien ya está inscrito
sigue avanzando. Se reabre cuando se quiera.

**Quién dispara el crédito.** `syncsOnWrite(course)` es verdadero en un finalizado
—escribir en él es corregirlo— y en un autogestivo publicado. Capturar un
resultado y terminar el contenido acaban en el mismo `completionSync.sync`, así
que el último dato que falte es el que otorga el crédito. El ejercicio sale del
`fallback` de `fiscalYearOf`, que es ese momento.

### 4.3 · La pestaña Avance

Cuando el curso tiene temario que cuenta (`requiresContent`), la ficha enseña el
porcentaje de cada participante y la fecha en que terminó el contenido, junto al
pase de lista. Se lee del caché `enrollments.progress_percent`, que solo escribe
el avance por lección (docs/content/00-modulos-y-lecciones.md §8).

### 4.4 · Curso evaluado con examen en línea

Con `evaluation_method = QUIZ`, el resultado lo escribe el examen del participante
([ADR 0015](../adr/0015-cuestionarios-autocalificados.md)) y hay **una sola vía**:

- Resultados queda de solo lectura, y capturar a mano, también al corregir,
  responde `TEACHING_RESULTS_BY_QUIZ`.
- Un pendiente no bloquea el cierre. Al finalizar, quien no lo presentó pasa a
  `FAILED` sin nota, y la pantalla lo enseña como «No presentó».
- Un autogestivo no se cierra: acredita al momento de presentar y quien no lo
  presentó queda pendiente.

## 5. Corrección posterior

Guardar asistencia o resultados en un curso `FINISHED` **es** la corrección, y
solo la hacen el superadministrador o el titular y los auxiliares de la
organizadora (`canCorrect`). Cada una termina en `completionSync.sync`:

| Situación tras corregir | Efecto en `credits` |
| --- | --- |
| Completa y no tenía crédito | Fila nueva con su dependencia **de hoy** |
| Completa y tenía uno retirado | Se restaura; **conserva** su dependencia original |
| Ya no completa y tenía uno vigente | `revoked_at` y `revoked_by_id`; la fila queda |

En un finalizado, un resultado no puede volver a `PENDING`.

## 6. Créditos

| Pantalla | Quién | Qué cuenta |
| --- | --- | --- |
| Mis créditos | Quien puede cursar (`requireParticipant`) | Sus créditos vigentes: total del ejercicio, acumulado y lista |
| Créditos (titular, auxiliar) | `requireScope` con `CREDIT_MANAGER_ROLES` | Su personal **y** quien obtuvo créditos para su dependencia aunque ya se haya ido (marcado "Transferido"). Cuenta solo `credits.dependency_id = su dependencia` |
| Créditos (superadministrador) | El mismo guard | Resumen por dependencia; al elegir una, su tabla de personal |

El ejercicio llega por `?ejercicio=`. El filtro `?dependencia=` solo se lee con
alcance global, como en cursos.

## 7. Valoración

- Valora quien estuvo `ENROLLED` en un curso `FINISHED` y asistió al menos a una
  sesión (`canRateCourse`). No exige haber completado.
- Un autogestivo no se finaliza ni tiene sesiones: se valora al quedar completada
  la inscripción, y quien lo imparte ve el resumen mientras sigue publicado.
- Una sola vez y sin editar: la unicidad de la base (P2002) se traduce a
  `RATING_ALREADY_RATED`, igual que la comprobación previa.
- "Mis cursos" enseña el diálogo en la tarjeta del curso finalizado, junto con
  asistencia, nota y si completó.
- El resumen (promedio a un decimal, número y comentarios) lo ven los mismos que
  pasan lista, y la proyección **no lee** `user_id`: el anonimato empieza en la
  consulta.
- La ficha del capacitador calcula "cursos impartidos" (finalizados en
  `course_trainers`) y "valoración promedio" (de esos cursos), con `null` sin
  valoraciones en lugar de un cero que mentiría.

## 8. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| Un capacitador interno pasa lista en un curso que creó y no imparte | `teachingCourseWhere` no tiene rama de autor |
| Un capacitador cambia la asistencia de un curso ya finalizado | `assertWritable` → `TEACHING_CORRECTION_FORBIDDEN` |
| Dos correcciones a la vez calculan sobre datos viejos | `FOR UPDATE` + relectura dentro de la transacción |
| Se finaliza dos veces y se otorgan créditos dobles | `finish` condicionado a `PUBLISHED`; crédito único por persona y curso |
| Cambiarse de dependencia y pedir una corrección mueve el crédito | Restaurar no toca `dependency_id` |
| Un externo suma créditos | `creditCandidatesOf` exige cuenta interna con dependencia |
| Un titular lee los créditos de otra dependencia pidiéndola en la URL | El filtro solo se lee con alcance global |
| Un participante lee la observación de una evaluación | Ninguna consulta de "Mis cursos" selecciona `evaluation_results` |
| Se infiere quién dejó un comentario | La consulta del resumen no selecciona al autor |
| Se valora dos veces con dos pestañas | Unicidad `(course_id, user_id)` → `RATING_ALREADY_RATED` |
| Una clase nocturna del 31 de diciembre cuenta para el año siguiente | `zonedYearOf` sobre la zona del instituto |

## 9. Añadir una operación

1. Si escribe en un curso, recibe el `AuthContext` y resuelve `TeachingScope`.
2. Dentro de `runInTransaction`: `lockCourse`, `assertWritable` y escritura.
3. Si el curso puede estar finalizado, termina en `syncCompletion`. No calcules
   créditos a mano.
4. Si escribe en una tabla de otro módulo, añade el método al puerto de ese
   módulo, no un `prisma` propio.
