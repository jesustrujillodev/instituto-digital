# ADR 0004 · Inscripción: una fila por persona, cupo con bloqueo y visibilidad por inscripción

**Estado:** aceptado · 2026-09-16
**Contexto del cambio:** PRD-04 (inscripción e invitaciones)

## 1. Contexto

§6.6 del alcance pide tres garantías que la aplicación sola no puede sostener
bajo concurrencia:

- una persona no tiene dos inscripciones activas en el mismo curso;
- nadie se inscribe, se asigna ni acepta una invitación si ya no hay cupo;
- un curso por invitación solo lo ve quien fue invitado.

Como PRD-03, PRD-04 se entrega con `prisma db push` y sin migraciones, así que
lo que la base garantice tiene que poder expresarse en Prisma.

## 2. Decisión

### 2.1 · Una fila por (curso, persona)

`org.enrollments` lleva `@@unique([courseId, userId])`. Una baja o un rechazo
cambian el `status`; volver a inscribirse o a ser invitado actualiza la misma
fila.

**Por qué:** "no dos inscripciones activas" con varias filas por persona exige
un índice único parcial (`WHERE status IN (...)`), que Prisma no declara. Con una
fila, la unicidad total lo resuelve y deja además la llave `(usuario, curso)` que
PRD-06 usa para el crédito y la valoración.

Cada escritura que no es un alta es un `updateMany` condicionado al estado
leído. Si otra petición cambió la fila entre la lectura y la escritura, no se
actualiza nada y el servicio responde `ENROLLMENT_STATE_CHANGED`. Dos altas
simultáneas chocan con la unicidad (P2002) y se traducen igual.

**Qué se pierde:** el historial de ida y vuelta de una misma persona. Quedan las
marcas del último evento de cada tipo (`invitedAt`, `enrolledAt`, `respondedAt`,
`withdrawnAt`).

### 2.2 · Cupo con bloqueo de la fila del curso

`lockCourseSeats(courseId)` ejecuta
`SELECT id FROM org.courses WHERE id = $1 FOR UPDATE` dentro de
`runInTransaction`, cuenta los `ENROLLED` y devuelve el cupo. Inscribirse,
aceptar, asignar y editar el cupo de un curso pasan por ahí.

**Por qué:** contar y luego insertar, sin bloqueo, deja pasar a dos personas por
el último lugar. El bloqueo serializa solo las escrituras de **ese** curso, no de
la tabla. Es el primer `$queryRaw` de lectura del proyecto; funciona sin tocar el
repositorio porque el proxy de `prisma` ya entrega el cliente de la transacción
ambiental.

**Alternativas descartadas:** un contador `enrolled_count` con `UPDATE ... WHERE
enrolled_count < capacity` (denormaliza y se desincroniza con cualquier escritura
que lo olvide) y aislamiento `SERIALIZABLE` (obliga a reintentar por
serialización en todas las operaciones del caso de uso).

### 2.3 · Visibilidad por inscripción

`courseVisibilityWhere` suma una rama: el visor interno ve un curso en el que
tiene una fila `INVITED` o `ENROLLED`, sea cual sea el acceso.

**Por qué:** es lo único que abre un curso por invitación, y cubre también §6.4:
quien sale de un grupo o de la audiencia después de inscribirse conserva su
inscripción, así que debe seguir viendo el curso. Rechazar o darse de baja
cierra el acceso si no hay otra rama que lo dé.

## 3. Consecuencias

**Lo que la base impone:** unicidad de `(course_id, user_id)`; `Restrict` hacia
la persona, su dependencia y quien actuó; `Cascade` desde el curso.

**Invariantes que la base NO impone**, y dónde viven:

| Invariante | Dónde vive |
| --- | --- |
| Transiciones válidas de estado | `canTransition` en `enrollment.rules.ts` |
| Cupo | `assertSeatsFor` con la fila del curso bloqueada |
| Externos y roles globales no cursan | `canParticipate` |
| El titular solo asigna personal de su dependencia | `findParticipants(ids, dependencyId)` + rechazo del lote |

**Riesgo asumido:** `FOR UPDATE` fuera de una transacción no bloquea nada. El
puerto lo documenta y las pruebas del servicio comprueban que el bloqueo ocurre
dentro de `runInTransaction`.
