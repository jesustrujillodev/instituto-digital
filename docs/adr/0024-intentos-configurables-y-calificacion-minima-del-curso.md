# ADR 0024 · Intentos configurables y calificación mínima aprobatoria del curso

**Estado:** aceptado · 2026-09-28
**Contexto del cambio:** MVP-02 · evaluaciones automáticas de los cursos
**Enmienda:** [ADR-0015](./0015-cuestionarios-autocalificados.md) (un solo intento),
[ADR-0016](./0016-evaluacion-por-modulo.md) §2.4 (cuándo se habilita otro intento) y
[ADR-0021](./0021-practica-evaluativa-y-calificacion-por-promedio.md) §2.1–2.4 (la práctica
bloquea, cuenta la nota aprobada y el resultado sale de aprobar cada evaluación)

## 1. Contexto

Tras ADR-0021, el examen final y la evaluación de módulo tenían un intento. La práctica, en
cambio, se reintentaba sin límite, y reprobar cualquiera bloqueaba el avance. La nota del
curso era el promedio, pero no había una mínima del curso: ADR-0021 dejó fuera el promedio
compensatorio.

Las decisiones del cliente:

- Los intentos se configuran **por cuestionario** (examen final, evaluación de módulo y
  práctica), con la opción de **sin límite**.
- Existe una **calificación mínima aprobatoria por curso**, 70 por defecto. Se suma a la
  mínima de cada evaluación, pero **compensa**: sacar 50, 100 y 100 da 83, y con mínima 70
  se acredita.
- Una evaluación reprobada **cuenta como presentada** en cuanto se envía. Mientras queden
  intentos se puede reintentar, y entra al promedio **la mejor nota**.
- Una evaluación **aprobada se cierra**.
- Al agotar los intentos sin aprobar, **quien imparte habilita otro**, también en el examen
  final y en la práctica.
- Cuando el curso **se acredita**, los reintentos se cierran y la nota queda fija.
- La mínima del curso **no aplica a la captura manual**: ahí sigue decidiendo quien imparte.

## 2. Decisiones

### 2.1 El tope vive en el cuestionario

`quizzes.max_attempts` es entero y nulo; nulo significa sin límite. Su default de columna es
1, el del examen y el módulo. El editor propone 1 para el examen y el módulo, y sin límite
para la práctica, como siempre fue.

Se congela con el banco (`assertBankEditable`), igual que `passing_score`, para que todas
las notas se midan con las mismas reglas. Las excepciones individuales se resuelven con
«otro intento».

Los intentos de una persona son consecutivos desde 1, así que el último dice cuántos lleva:

```
attemptsLeftOf(max, último) = max − último.number (+1 si el último tiene otro habilitado)
```

### 2.2 Disponibilidad

`quizAvailabilityOf(curso, inscripción, último, tipo, max)`:

| Último intento | Resultado |
| --- | --- |
| Ninguno | `AVAILABLE` (el examen de un curso por contenido espera a `contentCompletedAt`) |
| Aprobado | `TAKEN` |
| Reprobado, con el curso acreditado | `TAKEN` |
| Reprobado, con intentos o con otro habilitado | `AVAILABLE` |
| Reprobado y agotado | `TAKEN` |

«Acreditado» (`isAccredited`) es `result = PASSED` o `completed`. Así también cuenta quien
completó antes de que el temario escribiera resultados.

«Otro intento» (`canGrantRetakeOn`) solo se concede sobre el último intento: reprobado, sin
otro ya habilitado, con los intentos agotados y a quien no ha acreditado. El
`grantRetakeRule` recibe el dueño completo (`lessonDocumentId`, `moduleDocumentId`) y ya no
solo el módulo. El tablero de Impartición (`findQuizBoard`) lista las prácticas, las
evaluaciones de módulo y el examen final. Aparece también en los cursos por asistencia
evaluados con examen.

### 2.3 Presentada cuenta; entra la mejor nota

- `quizService.submit` completa la lección de una práctica con **cualquier** intento
  (revierte ADR-0021 §2.1). Tras cualquier intento de práctica o de módulo llama a
  `progressSync.recalculate`: el avance puede no moverse, pero una mejor nota puede
  acreditar.
- `findPassedQuizzes` pasa a `findBestScores`: cualquier intento, reducido a la nota máxima
  por (cuestionario, persona), con la misma clave de avance que antes.
- `countedScoresOf` promedia esas mejores notas. El examen final aporta la suya con
  `findBestScore`.

### 2.4 El resultado es el promedio contra la mínima del curso

`courses.min_passing_grade` (entero de 0 a 100, 70 por defecto). La regla es
`courseResultOf(grade, min) = grade ≥ min ? PASSED : FAILED`.

| Curso | Quién escribe | Cuándo |
| --- | --- | --- |
| Evaluado por examen | El envío del examen | En cada envío, con el promedio de las mejores |
| Sin «Requiere evaluación», con temario que cuenta | `progressSync` | A quien tiene el contenido terminado y todavía no acredita, si cambian la nota o el resultado |
| Captura manual | Quien imparte | Sin cambios |

`gradesAutomatically(curso)` nombra los dos primeros casos. El wizard solo muestra ahí el
campo, y la ficha y el resumen solo muestran ahí la mínima.

Como en un curso sin «Requiere evaluación» nadie captura resultados, un `FAILED` solo lo
escribe el temario. `isCompleted` pasa a exigir `result ≠ FAILED` en esos cursos, y en los
que exigen evaluación sigue exigiendo `PASSED`. Reintentar hasta subir el promedio escribe
`PASSED` y dispara `completionSync`.

La mínima se congela al publicar en cualquier formato, junto con el método de evaluación
(`assertCompletionSettingsEditable`).

## 3. Consecuencias

- **Esquema** (vía `db push`):
  - `courses.min_passing_grade INT NOT NULL DEFAULT 70`;
  - `quizzes.max_attempts INT NULL DEFAULT 1`.
- **Relleno único**, para que las prácticas existentes conserven el reintento libre:

  ```sql
  UPDATE org.quizzes SET max_attempts = NULL WHERE lesson_id IS NOT NULL;
  ```

- **Solo hacia adelante**: lo ya acreditado (`PASSED` o `completed`) no se recalifica, y
  nadie pierde un crédito ni un certificado. Los cursos anteriores toman la mínima de 70; un
  curso publicado ya no la cambia.
- **Firma**:
  - `quizAvailabilityOf` recibe la inscripción y el tope;
  - `assertRetakeGrantable` recibe el tope;
  - `toQuizSheet` recibe los intentos restantes;
  - `IQuizRepository` sustituye `findPassedQuizzes`, `findModuleQuizzes`,
    `findLatestModuleAttempts` y `findEnrolledUserId` por `findBestScores`, `findBestScore`,
    `findBoardQuizzes`, `findLatestAttempts` y `findEnrolledParticipant`;
  - `IQuizService.findModuleQuizBoard` pasa a `findQuizBoard`;
  - `ProgressState` gana `result`, `grade` y `completed`.
- **Fuera de alcance**: el promedio ponderado, reintentar una evaluación aprobada para
  subir la nota, y aplicar la mínima a la captura manual.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Presentar sin intentos ni otro habilitado, o ya acreditado | `CONTENT_QUIZ_ALREADY_TAKEN` |
| Habilitar otro intento con intentos restantes, a quien ya acreditó, sobre uno aprobado o ya reabierto, o fuera de un curso publicado | `CONTENT_QUIZ_RETAKE_NOT_ALLOWED` |
| Cambiar la mínima de un curso publicado | `COURSE_COMPLETION_LOCKED` |
| Intentos fuera de 1–10 (sin ser «sin límite») o una mínima fuera de 0–100 | Validación de frontera |
