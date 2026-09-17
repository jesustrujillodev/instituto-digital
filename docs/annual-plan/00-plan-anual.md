# Plan anual — Referencia

## 1. Qué es

`app/modules/annual-plan/` entrega §6.11 del alcance: la lista sencilla de los
cursos que una dependencia prevé dar en el año. No pasa por aprobaciones y
orienta sin restringir: un curso puede existir sin línea de plan.

| Ruta | Quién | Qué |
| --- | --- | --- |
| `/dashboard/plan-anual` | Superadministrador, titular, auxiliar | Planes con su avance. El titular y los auxiliares crean el del ejercicio actual o el siguiente; el superadministrador filtra por dependencia |
| `/dashboard/plan-anual/:documentId` | Los mismos | Líneas en lista y por mes, avance, y acciones por línea |
| `/dashboard/cursos/nuevo?linea=<id>` | Titular, auxiliar | Alta de curso precargada desde la línea |

Las decisiones están en [ADR 0007](../adr/0007-plan-anual-estado-derivado.md).

## 2. El modelo

| Tabla | Qué guarda |
| --- | --- |
| `org.annual_plans` | Dependencia, `fiscal_year` y autor. Único por `(dependency_id, fiscal_year)` |
| `org.plan_lines` | Título tentativo, `planned_month` (1–12), modalidad prevista, duración y público en texto libre, notas, `cancelled_at`, `cancelled_by_id` y autor |
| `org.courses.plan_line_id` | La línea que originó el curso. Un curso cancelado la conserva |

**No hay columna de estado.** Se deriva al leer (§3).

## 3. Estado y avance

| Estado | Cuándo | Lo decide |
| --- | --- | --- |
| Pendiente | Sin curso vigente, incluido si el suyo se canceló | `planLineStatusOf` |
| Programada | Curso vinculado en borrador o publicado | Ídem |
| Realizada | Curso vinculado finalizado | Ídem |
| Cancelada | `cancelled_at` no nulo; manda sobre lo demás | Ídem |

"Curso vigente" es el vinculado que no está `CANCELLED` (`activeCourseOf`).
Ni `courses` ni `teaching` escriben nada en el plan: publicar, cancelar o
finalizar un curso cambia el estado de su línea en la siguiente lectura.

El avance es `realizadas / (total − canceladas)` (`planProgressOf`), y es `null`
—"Sin líneas vigentes"— cuando no hay nada que medir.

## 4. Operaciones sobre una línea

| Acción | Se permite si | Código si no |
| --- | --- | --- |
| Agregar | Plan de este ejercicio o posterior | `ANNUAL_PLAN_READ_ONLY` |
| Editar | Línea no cancelada, plan vigente | `ANNUAL_PLAN_LINE_CANCELLED` |
| Cancelar | Sin curso vigente | `ANNUAL_PLAN_LINE_HAS_ACTIVE_COURSE` |
| Reactivar | Está cancelada | `ANNUAL_PLAN_LINE_NOT_CANCELLED` |
| Borrar | Nunca tuvo curso, ni cancelado (la FK lo impone) | `ANNUAL_PLAN_LINE_HAS_COURSES` |
| Crear curso | Vigente, sin curso vigente, plan no pasado | Los tres anteriores |

La pantalla calcula los mismos permisos por línea (`toPlanLineView.can`) para
mostrar solo las acciones válidas. El servidor los vuelve a comprobar.

## 5. Crear un curso desde una línea

```
Plan → "Crear curso"
  │ /dashboard/cursos/nuevo?linea=<id>
  ▼ loader: annualPlanService.findLineForCourse → título y modalidad precargados
Formulario (campo oculto planLine) → POST
  ▼ courseService.create, dentro de runInTransaction
  │ annualPlanRepository.lockLineForCourse   FOR UPDATE sobre la línea + relectura
  │ ¿plan de la dependencia organizadora?    si no, COURSE_PLAN_LINE_NOT_FOUND
  │ assertLineAvailableForCourse
  ▼ courseRepository.create({ …, planLineId })
```

La edición de un curso no cambia el vínculo, y su ficha enseña "Plan anual ·
<línea>" con enlace al plan.

## 6. Quién hace qué

| Rol | Ve | Escribe |
| --- | --- | --- |
| Superadministrador | Planes de todas las dependencias | Nada (matriz §3: "consulta") |
| Titular y auxiliar | Los de su dependencia | Crear plan, líneas y "Crear curso" |
| Capacitador, participante | 403 | — |

## 7. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| La línea dice "programada" con el curso ya cancelado | Estado derivado: no hay nada que sincronizar |
| Dos altas simultáneas ocupan la misma línea | `FOR UPDATE` sobre la línea dentro de la transacción del alta |
| Se vincula un curso a la línea de otra dependencia enviando el formulario a mano | `claimPlanLine` compara la dependencia del plan con la organizadora |
| Se borra una línea con historial | FK `Restrict` desde `courses` |
| Se modifica el plan de un año pasado | `assertPlanWritable` en cada escritura |
| Un titular abre el plan de otra dependencia por URL | `planScopeWhere` dentro del `where`: 404 |
| El superadministrador escribe un plan | `canManagePlans` exige alcance de dependencia |
| El 31 de diciembre por la noche el plan pasa a solo lectura antes de tiempo | `zonedYearOf` en la zona del instituto |

## 8. Añadir una operación

1. Resuelve el alcance con `resolveScope`. Si escribe, `requireManager`.
2. Busca plan o línea con `planScopeWhere` dentro del `where`.
3. Aplica `assertPlanWritable` y el `assert*` de la regla nueva en
   `annual-plan.rules.ts`, con su código.
4. Si necesita el estado, derívalo con `planLineStatusOf`: no añadas una columna.
