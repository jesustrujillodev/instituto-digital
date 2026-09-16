# ADR 0006 · Impartición: la corrección recalcula, el crédito se retira sin borrarse

**Estado:** aceptado · 2026-09-16
**Contexto del cambio:** PRD-06 (impartición, créditos y valoración)

## 1. Contexto

§6.8 a §6.10 del alcance cierran el ciclo del curso: pasar lista, capturar
resultados, finalizar, otorgar créditos, corregir después y valorar. Aparecen
tres cosas que PRD-01 a PRD-05 no tenían:

- una escritura que toca **cuatro tablas de tres módulos** en un solo acto
  (estado del curso, `completed` de cada inscripción, créditos y, en PRD-07, la
  línea del plan);
- un dato **derivado que se guarda** —el crédito— y que una corrección posterior
  puede invalidar;
- reglas de tiempo en la zona del instituto ("a partir de la fecha de la última
  sesión", "el ejercicio es el año de la última sesión").

Como PRD-03 a PRD-05, PRD-06 se entrega con `prisma db push` y sin migración.

## 2. Decisión

### 2.1 · Tres módulos, y la escritura ajena pasa por el puerto de su dueño

`teaching` es dueño de `course_attendance` y de los casos de uso. `credits` es
dueño de `credits` y solo expone lecturas como servicio. `ratings` es dueño de
`course_ratings`.

Finalizar y corregir escriben en tablas de otros módulos **por su repositorio**:
`ICourseRepository.finish`, `IEnrollmentRepository.saveResults` y
`setCompletion`, e `ICreditRepository.grant`, `restore` y `revoke`. Todo ocurre
dentro de la misma `runInTransaction`.

**Por qué:** es la regla de [0002](./0002-perfil-de-capacitador-y-transaccion-entre-modulos.md)
§2.3. La transacción ambiental ya permite repartir una escritura entre
repositorios, así que no hace falta que `teaching` escriba `courses.status` ni
`credits` a mano. Leer tablas ajenas sí se permite, como en
[0005](./0005-calendario-como-proyeccion-de-lectura.md) §2.1: `ratings` lee la
asistencia para decidir si alguien puede valorar.

**Qué obligaría a revisarlo:** que los créditos necesiten una escritura propia
fuera del cierre (un ajuste manual). Entonces `credits` tendría su caso de uso.

### 2.2 · La corrección no es otra operación: toda escritura en un finalizado recalcula

No hay un "corregir". Guardar asistencia o resultados en un curso `FINISHED` es
la corrección, y termina en `syncCompletion`: relee el curso, recalcula quién
completó con la fórmula de §6.8, deja `completed` igual al cálculo y aplica
`diffCredits` sobre los créditos existentes. El cierre llama a la misma función.

**Por qué:** si la corrección calculara un delta ("quitó una asistencia, ¿sigue
cumpliendo?"), habría dos implementaciones de la fórmula y divergirían. Recalcular
todo el curso cuesta leerlo entero. Es un curso, no una tabla.

Cada escritura bloquea antes la fila del curso con el mismo `FOR UPDATE` del cupo
([0004](./0004-inscripcion-una-fila-y-cupo-con-bloqueo.md) §2.2) y **relee** con
el bloqueo tomado. Así, dos correcciones simultáneas no calculan sobre datos
viejos, y nadie escribe asistencia en un curso que otra petición acaba de
finalizar. `finish` además se condiciona a `status = PUBLISHED`.

### 2.3 · El crédito se retira con `revoked_at`, no se borra

`credits` lleva `@@unique([userId, courseId])`, `revoked_at` y `revoked_by_id`.
Una corrección que deja a alguien sin completar marca la fila. Si después vuelve
a cumplir, la fila se **restaura**: se limpian las marcas y se registra quién la
otorga de nuevo.

**Por qué:** §5 del alcance pide no borrar, y "queda registrado quién hizo el
cambio y cuándo" (§6.8) incluye el retiro. Con una sola fila por persona y curso,
la unicidad de §6.9 la impone la base sin índice parcial, que Prisma no declara.

**La dependencia no cambia al restaurar.** Una fila nueva toma la dependencia
**actual** de la persona, que es la de "al obtenerlo". Una restaurada conserva la
de la primera vez. Si no fuera así, cambiarse de dependencia y pedir una
corrección movería un crédito ya contado, que es justo lo que el criterio 5 de §7
prohíbe.

### 2.4 · Quién hace qué

| Operación | Quién |
| --- | --- |
| Pasar lista, capturar resultados, finalizar | Superadministrador; titular y auxiliar en cursos de su dependencia; cualquier capacitador en los que **imparte** |
| Corregir un finalizado | Superadministrador; titular y auxiliar de la organizadora |
| Ver valoraciones | Los mismos que pasan lista |

`TeachingScope` no es una variante de `CourseScope`: sus ramas se **suman**. Un
auxiliar capacitador imparte lo de su dependencia y lo que le asignaron fuera.
Tampoco coincide con administrar: el capacitador interno edita lo que creó, pero
solo pasa lista en lo que imparte (matriz de §3).

### 2.5 · Las ventanas de tiempo

- **Pasar lista** se abre a las 00:00, en la zona del instituto, del día de la
  sesión.
- **Finalizar** se abre a las 00:00 del día de la última sesión.
- **El ejercicio** es el año local del inicio de la última sesión.

Las tres usan `startOfZonedDay` y `zonedYearOf` de `app/lib/date-utils.ts`. Una
sesión a las 20:00 de Tijuana ya es el día siguiente en UTC; sin la zona, una
clase del 31 de diciembre contaría para el año siguiente.

## 3. Consecuencias

**Lo que la base impone:** PK `(session_id, user_id)` en la asistencia, única
`(user_id, course_id)` en créditos y `(course_id, user_id)` en valoraciones.
`Restrict` desde el crédito hacia persona, curso y dependencia; `Cascade` desde
la sesión hacia su asistencia y desde el curso hacia sus valoraciones.

**Invariantes que la base NO impone**, y dónde viven:

| Invariante | Dónde vive |
| --- | --- |
| Puntuación 1–5, nota 0–100 entera | `rateCourseRule`, `saveResultsRule` |
| Solo se pasa lista a inscritos `ENROLLED` | `resolveAttendanceMarks` rechaza el envío entero |
| Un finalizado no vuelve a `PENDING` | `resolveResultEntries` |
| `completed` coincide con la fórmula | `syncCompletion`, en cada escritura sobre un finalizado |
| Un externo no suma crédito | `creditCandidatesOf` |
| Valora quien asistió a un finalizado | `canRateCourse` |

**Riesgos asumidos:**

- Editar un curso **publicado** y borrar una sesión con asistencia la borra en
  cascada. Es deliberado: la sesión dejó de existir y no debe contar para el
  porcentaje.
- Recalcular no mira quién completó "antes": si se corrige la asistencia mínima
  del curso, cosa que hoy no se puede porque un finalizado no se edita, todos los
  créditos se ajustarían a la nueva regla.
- La valoración queda aunque una corrección retire después toda la asistencia de
  quien valoró. Se valoró legítimamente con lo que había.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Borrar el crédito al retirarlo | Pierde quién y cuándo, y al restaurar cambiaría la dependencia |
| Corrección como delta sobre la persona tocada | Segunda implementación de la fórmula |
| Una tabla de bitácora de ajustes con motivo | §8 del alcance la deja "parcial": basta con quién y cuándo |
| `teaching` escribiendo `credits` y `courses` con su propio `prisma` | Rompe la frontera de escritura de 0002 |
| Calcular créditos al leer, sin tabla | §6.9 exige guardar la dependencia de ese momento |
| Finalizar desde que termina la última sesión | §6.8 habla de la **fecha**: el capacitador cierra el mismo día |
