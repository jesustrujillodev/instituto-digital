# ADR 0021 · Práctica evaluativa y calificación del curso por promedio

**Estado:** aceptado · 2026-09-25 · §2.1–2.4 enmendados por
[ADR-0024](./0024-intentos-configurables-y-calificacion-minima-del-curso.md) (presentada cuenta, la mejor nota y la mínima del curso)
**Contexto del cambio:** MVP-02 · reprobar tiene que bloquear el crédito y el certificado
**Enmienda:** [ADR-0015](./0015-cuestionarios-autocalificados.md) §2.1 y §2.2 (la práctica)
y §2.4 (la nota del examen). **Extiende:** [ADR-0016](./0016-evaluacion-por-modulo.md) §2.2
(qué cuenta como contenido)

## 1. Contexto

Según ADR-0015 §2.1, la práctica de una lección `QUIZ` «completa la lección, apruebe o no».
En un autogestivo sin «Requiere evaluación», con una sola práctica de mínimo 90, alguien sacó
0: la lección se completó, el contenido llegó a 100 % y `completionSync` otorgó el crédito y
emitió el certificado. Un cuestionario con calificación mínima que no bloquea nada al
reprobarse no es coherente.

Además, la nota del curso era solo la del examen final. Las evaluaciones de módulo tenían nota,
pero no se combinaba con nada.

Las decisiones del cliente:

- Reprobar una práctica **bloquea**: la lección no se completa hasta aprobarla.
- La práctica se **reintenta sola**, sin que nadie lo habilite.
- Para aprobar el curso hay que aprobar **cada** evaluación. La calificación del curso es el
  **promedio** de todas.
- Aplica **solo hacia adelante**: lo ya otorgado no se recalcula.

## 2. Decisiones

### 2.1 La práctica completa la lección solo aprobada

`quizService.submit` guarda el intento siempre, pero solo marca la lección `COMPLETED` y
recalcula el avance si el intento aprueba. Como el avance ya medía la lección, reprobarla deja
el contenido por debajo de 100 %: no se fija `contentCompletedAt`, y por tanto `isCompleted`
no da el curso por completado y no hay crédito ni certificado. `teaching` no cambia.

### 2.2 Reintento libre, sin tabla nueva

`quizAvailabilityOf` recibe el tipo del cuestionario en lugar de `isFinal`:

| Tipo | Último intento reprobado | Último intento aprobado |
| --- | --- | --- |
| Práctica | `AVAILABLE`: se reintenta solo | `TAKEN` |
| Módulo | `TAKEN` salvo `retake_granted_at` (ADR-0016 §2.4) | `TAKEN` |
| Examen final | `TAKEN` | `TAKEN` |

El siguiente envío usa `number + 1`, igual que en el módulo, y la unicidad
`(quiz, persona, número)` sigue frenando el doble envío. Una práctica aprobada no se repite,
porque su nota ya respalda el avance. Así «aprobó alguno» sigue equivaliendo a «aprobó el
último».

### 2.3 La calificación del curso es el promedio

`courseGradeOf(scores)` = `floor(suma / n)`, en enteros y hacia abajo como `gradeAttempt`.
Entran en el promedio (`countedScoresOf`) exactamente las mismas evaluaciones que mide el
avance:

- la nota aprobada de la práctica de cada lección medida (`measuredLessonsOf`);
- la nota aprobada de cada evaluación de módulo activa (`moduleQuizzesOf`);
- la nota del examen final, si el curso evalúa por examen.

Las dos primeras solo cuentan si la regla cuenta contenido (`CONTENT` o `BOTH`), igual que en
ADR-0016 §2.2: en un curso `ATTENDANCE` el temario es material de apoyo.

`findPassedModuleQuizzes` pasa a ser `findPassedQuizzes`. Trae prácticas y módulos con su
nota, y usa como clave la que cuenta en el avance: la lección, si es una práctica, o el
cuestionario, si es un módulo.

### 2.4 Quién escribe `result` y `grade`

| Curso | Quién escribe | `result` | `grade` |
| --- | --- | --- | --- |
| Evaluado por examen | El envío del examen | Si aprobó el examen | Promedio, examen incluido |
| Sin «Requiere evaluación», con alguna evaluación que cuente | `progressSync`, al fijar `contentCompletedAt` | `PASSED` | Promedio |
| Captura manual | Quien imparte | Sin cambios | Sin cambios |

En el segundo caso el resultado se escribe **antes** de `completionSync`, en la misma
transacción. Terminar el temario ya exige haber aprobado cada evaluación, así que no hay
`FAILED` que escribir. `isCompleted` no lee `result` cuando el curso no exige evaluación, así
que escribirlo no cambia quién completa; solo hace visible la nota en Mis cursos y en Mis
créditos.

## 3. Consecuencias

- **Esquema**: sin cambios.
- **Firma**:
  - `quizAvailabilityOf(..., kind: QuizKind)`.
  - `IQuizRepository.findPassedQuizzes` sustituye a `findPassedModuleQuizzes`.
  - `IProgressSync.recalculate` y `ContentCourseRef` ganan `completionRule` y
    `requiresEvaluation`.
- **Solo hacia adelante**: quien completó una lección con una práctica reprobada antes de este
  cambio conserva su completado, su crédito y su certificado (`contentCompletedAt` no se
  borra, ADR-0014).
- **Fuera de alcance**: el promedio ponderado, el mínimo aprobatorio del curso (promedio
  compensatorio) y promediar las evaluaciones de seguimiento de ADR-0010, que son de aprobado
  o no aprobado y no tienen nota.
