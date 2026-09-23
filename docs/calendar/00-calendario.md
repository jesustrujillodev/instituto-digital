# Calendario — Referencia

## 1. Qué es

`app/modules/calendar/` entrega §6.7 del alcance: la vista mensual y de lista de
las sesiones que le tocan a cada quien, en `/dashboard/calendario`. Es de solo
lectura y no tiene tablas propias. Las decisiones de diseño están en
[ADR 0005](../adr/0005-calendario-como-proyeccion-de-lectura.md).

Lo que **no** hace, por alcance:

- Validar traslapes ni bloquear horarios (§8).
- Exportar o suscribirse desde Outlook o Google Calendar (§11, punto abierto).
- Enseñar cursos autogestivos (D-04, MVP-02 · F-12). No tienen sesiones, y la
  proyección solo lee `course_sessions`, así que no dejan chips, huecos ni filas
  vacías. Tampoco entran en las opciones de filtro, que salen de las mismas
  sesiones. No hace falta filtrarlos: el formato se congela al publicar, y pasar
  a autogestivo borra las sesiones (ADR 0011 §2.5).

## 2. Quién ve qué

| Lente | Quién | Qué sesiones | Estados |
| --- | --- | --- | --- |
| `enrolled` | Quien puede cursar (`canParticipate`) | Cursos con su inscripción `ENROLLED` | Publicado, finalizado |
| `invited` | Quien puede cursar | Cursos con su invitación `INVITED` | Publicado |
| `teaching` | Cualquier cuenta, interna o externa | Cursos donde está en `course_trainers` | Publicado, finalizado |
| `organizing` | Titular y auxiliar; capacitador interno | Los de su dependencia; el capacitador, los que creó | Borrador, publicado, finalizado |
| `staff` | Titular y auxiliar con "Incluir cursos de mi personal" | Cursos con un `ENROLLED` de alguien que **hoy** es de su dependencia | Publicado, finalizado |
| `global` | Superadministrador | Todos | Borrador, publicado, finalizado |

Un curso cancelado no aparece nunca. Si una sesión cumple varias lentes, sale una
sola vez con todas. El color lo decide la primera en este orden:
`organizing`, `global`, `teaching`, `enrolled`, `invited`, `staff`.

## 3. El recorrido de una petición

```
GET /dashboard/calendario?month=2026-11&view=list&staff=1
  │ loader: requireAuth (sin guard de rol) + validateCalendarQuery
  ▼
calendarService.listSessions(query, auth)
  │ resolveCalendarPlan(auth, staff)     → qué lentes aplican
  │ toCalendarPeriod(month)              → días de la cuadrícula
  │ periodRange(period)                  → [from, to) en UTC
  ▼
calendarRepository.findSessions({ from, to, courseFilter: calendarCourseWhere(plan), … })
  ▼
toCalendarSessions(plan, rows)           → lentes + "Ver curso" por sesión
filterOptionsOf / applyCalendarFilters   → opciones y filtros en memoria
```

## 4. Parámetros

| Parámetro | Valores | Por defecto |
| --- | --- | --- |
| `month` | `YYYY-MM`, años 2000–2100 | El mes en curso en Tijuana |
| `view` | `month`, `list` | `month` |
| `modality` | `IN_PERSON`, `ONLINE`, `HYBRID` | Todas |
| `dependency`, `trainer` | `documentId` | Todos |
| `staff` | `1` | Apagado; se ignora si no se es titular o auxiliar |

Un parámetro mal formado responde 400. Un mes fuera de rango responde
`CALENDAR_INVALID_MONTH`, también con 400.

## 5. "Ver curso"

| Lentes de la sesión | Destino |
| --- | --- |
| Incluye `organizing` o `global` | `/dashboard/cursos/:id/editar` |
| Incluye `enrolled` o `invited`, o `teaching` en quien puede cursar | `/dashboard/cursos-disponibles/:id` |
| Solo `teaching` de un externo, o solo `staff` | Sin enlace: basta el panel |

## 6. Archivos

| Archivo | Qué hace |
| --- | --- |
| `domain/calendar.access.ts` | `calendarCourseWhere`: el `OR` de la consulta |
| `domain/calendar.rules.ts` | Plan, lentes, enlace, filtros y aritmética del periodo |
| `infrastructure/calendar.repository.server.ts` | La única consulta, sobre `course_sessions` |
| `application/calendar.service.server.ts` | Orquesta y devuelve `AppResponse<CalendarData>` |
| `components/` | Cuadrícula, lista, chip de sesión y panel |
| `prisma/seed-calendar.ts` | "Archivo y transparencia": invitación pendiente, personal en otra dependencia y sesiones a ambos lados del cambio de horario |
