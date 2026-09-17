# ADR 0007 · Plan anual: el estado de la línea se deriva, no se sincroniza

**Estado:** aceptado · 2026-09-16
**Contexto del cambio:** PRD-07 (plan anual)

## 1. Contexto

§6.11 del alcance da a cada línea del plan cuatro estados:

- `pendiente`: al crearla o si su curso se cancela;
- `programada`: tiene un curso en borrador o publicado;
- `realizada`: el curso se finalizó, "es automático";
- `cancelada`: la canceló alguien a mano.

El criterio 6 de §7 exige que la línea pase de pendiente a programada y luego a
realizada "sin que nadie la actualice a mano".

Los tres primeros estados los provocan acciones de **otros módulos**:

- crear un curso (`courses`);
- cancelarlo (`courses`);
- finalizarlo (`teaching`, [0006](./0006-imparticion-creditos-y-valoracion.md)).

Además, la línea se vincula como máximo a un curso, pero un curso cancelado la
libera.

`org.courses.plan_line_id` existe desde PRD-03 sin relación. Como PRD-03 a
PRD-06, PRD-07 se entrega con `prisma db push`.

## 2. Decisión

### 2.1 · Solo se guarda la cancelación manual

`org.plan_lines` no tiene columna de estado. Guarda `cancelled_at` y
`cancelled_by_id`, y `planLineStatusOf` deriva el resto en cada lectura:

```
cancelled_at no nulo                     → CANCELLED
curso vinculado no cancelado, FINISHED   → DONE
curso vinculado no cancelado, otro       → SCHEDULED
ninguno                                  → PENDING
```

**Por qué:** una columna `status` obligaría a escribirla desde tres casos de uso
en dos módulos, cada uno dentro de su transacción. Cualquier camino que la
olvide —una corrección, un script, un PRD futuro que finalice cursos de otra
forma— la deja mintiendo sin que nada lo detecte. Derivarla hace imposible la
desincronización, y el criterio 6 se cumple por construcción: ni `courses` ni
`teaching` saben que el plan existe. El comentario que PRD-06 dejó en
`teaching.finish` se retiró sin sustituirlo.

**Lo que se paga:** leer un plan trae los cursos de cada línea (`documentId`,
`title` y `status`). Es una consulta con un join por plan, y un plan tiene
decenas de líneas, no miles.

**Qué obligaría a revisarlo:** filtrar o paginar líneas por estado en la base
—un listado global de "líneas pendientes de todas las dependencias"—. Entonces
convendría una vista o una columna calculada.

### 2.2 · El vínculo conserva la historia; "un curso" significa "un curso vigente"

El curso cancelado **conserva** `plan_line_id`. La línea vuelve a pendiente y
admite otro curso, que también apunta a ella. §6.11 ("cada línea se vincula como
máximo a un curso") se lee como un curso **no cancelado** a la vez.

La base no puede imponerlo. Haría falta un índice único parcial
(`WHERE status <> 'CANCELLED'`), que Prisma no declara. Lo protege el alta del
curso:

1. `courses.create` recibe `planLine` y, dentro de su `runInTransaction`, llama a
   `annualPlanRepository.lockLineForCourse`: `SELECT … FROM org.plan_lines … FOR
   UPDATE` y relectura con el plan y los cursos vinculados.
2. Comprueba que el plan sea de la dependencia organizadora ya resuelta
   (`COURSE_PLAN_LINE_NOT_FOUND` si no) y aplica `assertLineAvailableForCourse`:
   línea vigente, sin curso activo y de un ejercicio que no ha pasado.
3. Escribe `planLineId` en el propio curso.

Dos altas simultáneas sobre la misma línea se serializan en el bloqueo, y la
segunda ve el curso de la primera. Es el mismo patrón que el cupo en
[0004](./0004-inscripcion-una-fila-y-cupo-con-bloqueo.md) §2.2.

La escritura es sobre `courses`, que es la tabla del módulo que la hace. La
lectura del plan va por el puerto de `annual-plan`, así que no se cruza la
frontera de [0002](./0002-perfil-de-capacitador-y-transaccion-entre-modulos.md)
§2.3.

**Alternativa descartada:** borrar `plan_line_id` al cancelar. Daría una
unicidad real, pero `cancel` tendría que escribir en el plan (el problema de
§2.1) y se perdería qué línea originó el curso cancelado.

### 2.3 · Borrar solo corrige capturas

Una línea se borra solo si **nunca** tuvo curso, ni siquiera cancelado. La FK
`courses.plan_line_id → plan_lines` es `Restrict`, así que la base lo impone:
P2003 se traduce a `ANNUAL_PLAN_LINE_HAS_COURSES`. La comprobación del servicio
solo adelanta el mensaje.

Cancelar una línea con curso vigente se rechaza
(`ANNUAL_PLAN_LINE_HAS_ACTIVE_COURSE`): dejaría un curso programado bajo una
línea que dice "cancelada". Primero se cancela el curso.

### 2.4 · Solo lectura por ejercicio, en la zona del instituto

Un plan con `fiscalYear < zonedYearOf(now)` es de solo lectura (§6.11): no admite
líneas, ediciones ni "Crear curso". Solo se crean planes del ejercicio actual y
del siguiente. El año sale de `zonedYearOf`, igual que el ejercicio de un
crédito: la noche del 31 de diciembre en Tijuana todavía es ese año.

### 2.5 · Quién

`PLAN_ACCESS_ROLES` deja entrar al superadministrador, al titular y a los
auxiliares. Escribir exige alcance de dependencia (`canManagePlans`), como en
`groups`: el superadministrador consulta (matriz de §3). Fuera de alcance
responde igual que inexistente.

## 3. Consecuencias

**Lo que la base impone:** único `(dependency_id, fiscal_year)` en
`annual_plans`, y `Restrict` desde el curso hacia la línea y desde la línea hacia
el plan, su autor y quien la canceló.

**Invariantes que la base NO impone**, y dónde viven:

| Invariante | Dónde vive |
| --- | --- |
| Un solo curso no cancelado por línea | `lockLineForCourse` + `assertLineAvailableForCourse` en `courses.create` |
| El curso y la línea son de la misma dependencia | `claimPlanLine` en `courses.service.server.ts` |
| Mes 1–12 | `planLineRule` |
| Ejercicios anteriores de solo lectura | `assertPlanWritable` |

**Riesgos asumidos:**

- El estado se calcula en la aplicación: una consulta SQL directa no lo ve.
- Si un día se editara la organizadora de un curso, que hoy no cambia, su
  vínculo apuntaría al plan de otra dependencia. La regla de edición no declara
  la organizadora, así que no puede pasar sin cambiar ese contrato.
