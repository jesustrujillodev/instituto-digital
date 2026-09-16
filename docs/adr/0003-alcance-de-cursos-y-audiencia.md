# ADR 0003 · Alcance de cursos, audiencia y zona horaria

**Estado:** aceptado · 2026-09-16
**Contexto del cambio:** PRD-03 (cursos, sesiones y acceso)

Fija tres decisiones que PRD-04 a PRD-07 dan por hechas y que revisar más tarde
costaría una migración de datos o reescribir la regla de visibilidad.

## 1. Contexto

PRD-01 resolvió el alcance por dependencia con un `AccessScope` de cuatro
variantes, y PRD-02 añadió el perfil de capacitador como extensión de la cuenta.
El curso es el primer recurso que:

- administra alguien **sin rol de gestión**: la matriz de §3 deja al capacitador
  interno crear cursos y editar los que creó;
- tiene una **audiencia de dos tipos** —dependencias completas o listas
  nominales— que el modelo de §5 describía como una sola tabla;
- guarda **horas** que se capturan, se muestran y se comparan (inscripción,
  calendario, cierre), sin que el repositorio tuviera ninguna noción de zona
  horaria.

Además, PRD-03 se entrega sin migraciones: la base se actualiza con
`prisma db push`, así que todo lo que haya que garantizar tiene que ser
expresable por Prisma.

## 2. Decisión

### 2.1 · Un alcance propio del módulo, con variante `creator`

`domain/course.access.ts` declara `CourseScope` =
`global | dependency | creator | none`, derivado de `resolveScope` más el claim
`isTrainer`.

**Por qué:** `AccessScope` traduce al capacitador con rol `USER` como `self`, que
para cursos significaría "ninguno", y ninguna de sus variantes expresa "de su
dependencia **y** creados por él". Ampliar `AccessScope` con esa variante la
obligaría a tener significado en `users`, `groups` y `dependencies`, donde no lo
tiene. La traducción local deja intacto el contrato compartido.

`creator` exige dependencia: el capacitador externo resuelve a `none`, que es lo
que §4 del alcance pide.

El guard no puede ser `requireRole` —la condición no es un rol— y se resuelve
igual que el catálogo de PRD-02: `requireAuth` + predicado + `forbiddenRole`.

**Qué obligaría a revisarlo:** que un segundo módulo necesite la variante
`creator`. En ese punto conviene subirla a `shared/auth` con significado en todos.

### 2.2 · La audiencia en dos tablas

`course_dependency_audience(course_id, dependency_id)` y
`course_group_audience(course_id, group_id)`, cada una con PK compuesta de dos
columnas obligatorias.

**Por qué:** §5 del alcance describía una tabla con `dependencia_id` **o**
`grupo_id`. Con esa forma, la base no impone dos cosas:

1. Que cada fila use exactamente una de las dos columnas — solo lo prohibiría un
   `CHECK`, que Prisma no declara.
2. Que no se repita la misma audiencia en un curso — un índice único sobre una
   columna nullable no compara las filas donde vale `NULL`, porque en Postgres
   dos `NULL` nunca son iguales.

Con dos tablas no hay columnas vacías: la tabla es el tipo y la PK impide
repetir. Prisma lo expresa sin SQL a mano.

No es redundante con la dependencia: un grupo acota a unas pocas personas de
**una** dependencia, así que restringir a un grupo es más estrecho que
restringir a su dependencia.

**Qué obligaría a revisarlo:** un tercer tipo de audiencia. Se añade una tercera
tabla; si llegaran a ser muchos, conviene reconsiderar una tabla con `CHECK` una
vez que el proyecto vuelva a escribir migraciones.

### 2.3 · Instantes en UTC, una sola zona del instituto

Las sesiones guardan `starts_at` y `ends_at` como `DateTime`. La plataforma
opera **siempre** en `America/Tijuana`, declarada en un solo sitio
(`app/lib/date-utils.ts`), y la conversión ocurre en dos fronteras: el servicio
al escribir y la presentación al mostrar.

**Por qué:** inscripción ("cierra al empezar la primera sesión"), calendario y
cierre ("a partir de la última sesión") comparan instantes. Con fecha y horas
separadas, cada una de esas reglas tendría que recomponerlos. Con un único
instante la comparación es directa y el índice de `starts_at` sirve al
calendario.

La zona es fija porque el instituto es de una sola ciudad. Se resuelve con
`Intl`, que ya conoce el horario de verano: codificar las fechas de cambio a mano
es el error que la prueba de noviembre existe para atrapar.

**Qué obligaría a revisarlo:** una dependencia en otra zona horaria. La zona
pasaría a ser atributo de la dependencia; los datos guardados en UTC no
cambiarían.

## 3. Consecuencias

**Lo que la base impone:**

- La PK compuesta de cada tabla de audiencia y la de `course_trainers`.
- `Restrict` desde el curso hacia su organizadora, su autor y los grupos y
  dependencias de audiencia; `Cascade` desde el curso hacia sus filas hijas.

**Invariantes que la base NO impone**, y dónde viven:

| Invariante | Dónde vive |
| --- | --- |
| Solo un curso `RESTRICTED` tiene audiencia | `buildWriteData` descarta la audiencia de cualquier otro acceso |
| Los capacitadores asignados tienen perfil activo al asignarse | `findEligibleTrainers` + rechazo del lote |
| La organizadora no cambia | `updateCourseRule` no la declara |
| Una sesión editada pertenece a su curso | `syncSessions` solo actualiza `documentId` propios |

**Lo que se paga:**

- Leer la audiencia de un curso son dos joins en vez de uno.
- El formulario captura fecha y horas por separado y las compone en el servicio.
- `SessionUser` no lleva el tipo de cuenta, así que el menú enseña "Cursos" al
  capacitador externo aunque su loader responda 403.

**Riesgo asumido:** un capacitador cuyo perfil se desactiva conserva sus
asignaciones. Es deliberado: deshacerlas borraría el historial de lo impartido.
La consecuencia se cobra al publicar, que exige al menos uno activo.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Añadir `creator` a `AccessScope` | Le daría una variante sin significado en `users`, `groups` y `dependencies` |
| Rol `TRAINER` para que `requireRole` baste | Rompe la acumulación de roles, ya descartado en ADR 0002 |
| Una tabla de audiencia con dos columnas nullables | Ni exclusividad ni unicidad sin `CHECK` escrito a mano (§2.2) |
| Solo audiencia por dependencia | Pierde el caso "exclusivo de un grupo" de §6.5 y deja `groups` sin consumidor |
| Fecha y horas `HH:mm` como texto | Toda regla temporal de PRD-04 a PRD-06 tendría que recomponer el instante |
| Guardar la hora local sin zona | `datetime-local` no lleva offset: el desfase sería silencioso y distinto en verano e invierno |
| Validar modalidad ↔ sede/enlace al guardar | Impediría dejar un borrador a medias, que es para lo que sirve |
| Recrear las sesiones en cada edición | Cambiaría su identidad y dejaría huérfana la asistencia de PRD-06 |
