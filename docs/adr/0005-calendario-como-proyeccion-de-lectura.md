# ADR 0005 · Calendario: proyección de lectura por lentes

**Estado:** aceptado · 2026-09-16
**Contexto del cambio:** PRD-05 (calendario)

## 1. Contexto

§6.7 del alcance pide una vista mensual de sesiones en la que cada rol ve un
conjunto distinto, y quien acumula roles lo ve todo junto pero diferenciado. El
calendario "no es una entidad nueva": se arma con sesiones, cursos,
capacitadores e inscripciones, que viven en tres módulos distintos
(`courses`, `enrollments` y, por la cuenta, `users`).

Ya existe una regla de visibilidad, `courseVisibilityWhere`, que responde "qué
cursos puede ver esta persona". El calendario hace otra pregunta: "qué cursos
**son suyos**". Un curso público es visible para todo interno, pero no por eso
aparece en el calendario de todos.

## 2. Decisión

### 2.1 · Un módulo de solo lectura con su propio repositorio

`app/modules/calendar/` no escribe nada y no tiene tablas. Su repositorio hace
**una** consulta sobre `org.course_sessions` acotada por rango de fechas, con el
filtro de cursos en el `where` y la proyección que el etiquetado necesita.

**Por qué:** componer los puertos de `courses` y `enrollments` serían varias
lecturas unidas en memoria y un filtro de pertenencia aplicado después de leer,
justo lo que [0001](./0001-modelo-de-roles-y-alcance-por-dependencia.md) §4
descarta. Leer tablas de otro módulo no cruza la frontera que protege
[0002](./0002-perfil-de-capacitador-y-transaccion-entre-modulos.md) §2.3: esa es
de **escritura**.

**Qué obligaría a revisarlo:** que el calendario necesite escribir (confirmar
asistencia, exportar a un calendario externo con estado propio).

### 2.2 · Lentes en vez de variantes de alcance

Cada sesión lleva los motivos por los que le corresponde al visor: `enrolled`,
`invited`, `teaching`, `organizing`, `staff` o `global`. El servicio resuelve un
`CalendarPlan` a partir del `AuthContext` y lo traduce dos veces, con la misma
lógica:

- `calendarCourseWhere(plan)` → la rama `OR` de la consulta;
- `lensesOf(plan, row)` → las etiquetas de cada fila que llega.

**Por qué:** un alcance único (`global | dependency | …`) no puede expresar
"cursa aquí, imparte allá y organiza lo de su dependencia" a la vez, que es el
caso normal de un auxiliar capacitador. Las lentes se suman sin jerarquía y la
interfaz decide cuál pinta.

`organizing` reutiliza `resolveCourseScope` de `courses`, así que el capacitador
interno organiza exactamente lo mismo que administra en `/dashboard/cursos`.

### 2.3 · Cuatro reglas que el alcance deja abiertas

| Regla | Decisión | Por qué |
| --- | --- | --- |
| `teaching` | Por filas de `course_trainers`, **sin** mirar el claim `isTrainer` | Un perfil desactivado conserva sus asignaciones ([0003](./0003-alcance-de-cursos-y-audiencia.md) §3); sus sesiones son su historial |
| Borradores | Solo por `organizing` o `global` | §6.7: "únicamente para quien organiza el curso". El superadministrador edita todos, así que los ve todos |
| `staff` | Por la dependencia **actual** de la persona inscrita, no por `enrollments.dependency_id` | El calendario muestra el presente. Los créditos (PRD-06) sí usan la dependencia guardada |
| Cancelados | Nunca, por ninguna lente | §6.7 |

### 2.4 · El detalle es un panel; el enlace depende de la lente

Al abrir una sesión se muestra un panel con curso, horario, modalidad, sede,
enlace y capacitadores. "Ver curso" lleva a la edición (`organizing`, `global`)
o al detalle de participante (`enrolled`, `invited`, o `teaching` para quien
puede cursar). El capacitador externo y quien solo mira a su personal no tienen
enlace: ningún detalle existente les respondería, y el panel ya trae lo que
§6.7 pide.

## 3. Consecuencias

- **Sin cambios de schema.** El índice de `starts_at` de PRD-03 sirve al rango.
- **Los filtros de dependencia, modalidad y capacitador se aplican en memoria**,
  sobre lo ya autorizado. No amplían nada, y así las opciones del filtro no se
  reducen al elegir una. Las opciones salen de lo visible, no de catálogos: un
  participante no consulta el catálogo de capacitadores (§3).
- **El rango es la cuadrícula completa** (semanas de lunes a domingo), con cada
  extremo convertido desde la medianoche de Tijuana de su propia fecha: la
  cuadrícula de noviembre empieza en horario de verano y termina en estándar.
- **Riesgo asumido:** un mes con muchísimas sesiones no se pagina. Para el
  volumen de una institución municipal, un mes cabe en una respuesta; si deja de
  caber, se pagina por semana sin tocar las lentes.
