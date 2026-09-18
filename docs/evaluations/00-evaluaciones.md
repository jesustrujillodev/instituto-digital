# Evaluaciones del curso — Referencia

## 1. Qué es

`app/modules/evaluations` permite que un curso tenga **varias evaluaciones** y
que quien lo imparte capture, por persona, aprobado / no aprobado y una
observación en texto libre.

Las decisiones están en [ADR 0010](../adr/0010-evaluaciones-por-curso.md).

Lo que **no** es:

- No es el veredicto que otorga el crédito. Ese sigue siendo
  `org.enrollments.result`, capturado a mano en la pestaña Resultados
  ([impartición](../teaching/00-imparticion-creditos-y-valoracion.md)).
- No es un cuestionario en línea. Eso sigue fuera del MVP (M6).
- No lo ve el participante: es material interno de quien imparte u organiza.

## 2. El modelo

| Tabla / columna | Qué guarda |
| --- | --- |
| `org.course_evaluations` | Una fila por evaluación: `course_id`, `session_id` opcional, `title`, quién la creó |
| `org.evaluation_results` | Una fila por `(evaluation_id, user_id)`: `passed` (nullable), `note`, `recorded_by_id`, `recorded_at` |

Dos convenciones que hay que tener presentes:

- **Sin fila es "sin capturar".** Igual que en el pase de lista. Vaciar el
  veredicto y la observación borra la fila.
- **`passed` nullable no es lo mismo que sin fila.** Es "hay observación pero
  todavía no hay veredicto": el caso de "falta que entregue el reporte".

`session_id` es `onDelete: SetNull`: editar un curso y quitar una sesión deja la
evaluación sin día, nunca la borra.

## 3. Rutas y permisos

| Qué | Dónde |
| --- | --- |
| Ver y capturar | Pestaña **Evaluaciones** de `/dashboard/imparticion/:documentId` |
| Escribir | `POST /dashboard/imparticion/:documentId/evaluaciones` (solo action) |

La pestaña aparece con la misma condición que Resultados: el curso debe tener
`requiresEvaluation`. El loader de impartición carga el tablero solo en ese
caso.

Quién escribe, calcado del resultado final (`canWrite` de `teaching.rules`):

| Estado del curso | Quién |
| --- | --- |
| `PUBLISHED` | Quien lo imparte u organiza |
| `FINISHED` | Solo alcance global o la dependencia organizadora (es corrección) |
| Cualquier otro | Se ve igual que inexistente |

El tablero trae `canWrite` resuelto: la UI no vuelve a evaluar permisos.

## 4. El envío

El panel manda **la lista completa** del curso en un solo `payload` JSON, con
`passed: boolean | null` y `note` por persona. El dominio decide qué hacer:

```
resolveCaptureWrites(target, entries)
  │ userDocumentId → userId   (si falta alguien: EVALUATION_UNKNOWN_PARTICIPANT,
  │                            se rechaza el envío entero)
  ├─ passed === null && note === null  →  deletes  (si había fila)
  ├─ idéntico a lo guardado            →  se omite
  └─ resto                             →  writes
```

Omitir lo idéntico no es una optimización: es lo que hace que `recorded_by` diga
quién hizo el último cambio y no quién pulsó guardar después. Por eso la
observación se normaliza en la frontera (`trim`, `"" → null`): sin eso, un
espacio al final reescribiría a todo el curso.

Altas, cambios y bajas del mismo envío van en una transacción.

## 5. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| Un participante lee la observación que escribió su capacitador | Ninguna consulta de "Mis cursos" selecciona `evaluation_results` |
| Se capturan evaluaciones de un curso que no se imparte | `teachingCourseWhere` en el `where` del curso |
| Un capacitador corrige un curso ya finalizado | `canWrite` → `EVALUATION_FORBIDDEN` |
| Se cuelga una evaluación de la sesión de otro curso | `findSessionId` acota por `course_id` |
| Guardar dos veces reescribe quién capturó | El diff descarta lo idéntico |
| Una lista interminable de evaluaciones | `EVALUATIONS_PER_COURSE_LIMIT` |
| Una observación enorme llena la base | `EVALUATION_NOTE_MAX_LENGTH` en la frontera |

## 6. Añadir una operación

1. Resuelve el alcance con `resolveTeachingScope` y busca el curso con
   `teachingCourseWhere`. Sin curso, `EVALUATION_COURSE_NOT_FOUND`.
2. Si escribe, pasa por `canWrite` y lanza **errores de este módulo**, no de
   teaching: el adaptador solo carga `EVALUATION_ERROR_MESSAGES`.
3. Si escribe en una tabla de otro módulo, añade el método al puerto de ese
   módulo. Aquí no hay ninguna: este módulo es dueño de las dos que toca.
4. No calcules créditos ni completado. Eso es de `teaching` y no cambia.
