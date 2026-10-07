# Panel de inicio (`/dashboard`)

Lo que cada persona ve al entrar. La decisión de arquitectura está en el
[ADR 0034](../adr/0034-panel-de-inicio-por-composicion.md).

## Facetas

`resolveDashboardFacets` (`app/modules/dashboard/domain/dashboard.rules.ts`):

| Faceta | Quién | Abre |
|---|---|---|
| `participates` | `canParticipate`: con dependencia y no superadministrador | «Tu capacitación» |
| `teaches` | perfil de capacitador | sus sesiones en «Para hoy» y en la semana |
| `organizes` | alcance de cursos `dependency` o `creator` | «{Dependencia}» o «Lo que organizas» |
| `plans` | alcance `dependency` (titular y auxiliar) | la tarjeta del plan anual |
| `platform` | superadministrador | «Operación», «Dependencias sin titular», plan por dependencia |

| Persona | Lo que ve |
|---|---|
| Participante | Para hoy · Esta semana · Tu capacitación |
| Capacitador externo | Para hoy · Esta semana |
| Capacitador interno | Para hoy · Esta semana · Lo que organizas · Tu capacitación |
| Titular o auxiliar | Para hoy · Esta semana · {Dependencia} (con plan) · Tu capacitación |
| Superadministrador | Operación y Dependencias sin titular · Esta semana · Plan anual por dependencia |

## Bloques y de dónde sale cada dato

| Bloque | Servicio | Qué muestra |
|---|---|---|
| Para hoy | `buildToday` sobre la semana, lo pendiente de finalizar y las invitaciones | Sesiones de hoy que no han terminado (impartes → «Mostrar QR»; cursas → «Entrar» o detalles), cursos cuyas sesiones ya terminaron y falta finalizar, invitaciones que cierran pronto. Vacío: lo próximo de la semana. |
| Esta semana | `calendarService.listWeek` | Hoy y los seis días siguientes, con los lentes y colores de `/dashboard/calendario`. Tope de 60 sesiones (`truncated`). |
| Tu capacitación | `enrollmentSummaryService.summarizeMine`, `certificateService.listMine({ limit })`, `creditService.summarizeYear` | En curso (avance y asistencia que falta y si aún alcanza), por empezar, invitaciones que no urgen, por valorar, certificados recientes y créditos del ejercicio. |
| {Dependencia} | `annualPlanService.summarizeCurrent`, `courseAttentionService.summarize`, `enrollmentSummaryService.summarizeOpen` | Avance del plan y líneas de este mes o atrasadas sin curso; borradores y publicados sin capacitador activo; inscripción abierta con cupo, invitaciones sin responder y cierre. |
| Plataforma | `operationsService.summarizeHealth`, `sessionMonitorService.countActive`, `dependencyService.listWithoutHead`, `annualPlanService.summarizeCoverage` | Correos fallidos y atascados, trabajos fallidos de 7 días, bloqueo activo (del loader del layout), sesiones abiertas, dependencias sin titular y avance del plan por dependencia. |

Los topes de cada lista están en `DASHBOARD_LIMITS` (`dashboard.config.ts`).

## Reglas que conviene conocer

- **Por finalizar** exige que la última sesión ya haya terminado. Es más estricto
  que `finishBlockerOf`, que permite finalizar desde el inicio del día de la
  última sesión. El superadministrador no lo recibe: sería la plataforma entera.
- **Sesiones pasadas sin asistencia** no aparecen: con
  `MANUAL_ATTENDANCE_ENABLED = false` no hay forma de corregirlas.
- **Asistencia que falta** usa la misma comparación entera que `meetsAttendance`.
- **Poca inscripción**: empieza dentro de 7 días y no llega a la mitad del cupo;
  sin cupo, nadie inscrito (`LOW_ENROLLMENT`).
- Las invitaciones que cierran pronto van en «Para hoy» y no se repiten en
  «Tu capacitación».

## Rendimiento

Medido con `DEBUG_QUERY_COUNT=true` y `.data?_routes=modules/dashboard/routes/home/index`,
segunda petición con el servidor recién arrancado:

| Persona (seed) | Consultas | Total |
|---|---|---|
| `super@` | 8 | 99 ms |
| `laura.sop@` (titular) | 13 | 167 ms |
| `carlos.sop@` (auxiliar capacitador) | 13 | 169 ms |
| `diana.sds@` (capacitadora interna) | 12 | 166 ms |
| `miguel.sop@` (participante) | 7 | 91 ms |
| `elena.torres@` (externa) | 3 | 88 ms |

Todas van en una sola fase. «Mis cursos» se lee ahora con sus dos consultas en
paralelo (`readMyCourses`), lo que también baja `/dashboard/mis-capacitaciones`
de ~170 ms a ~90 ms para quien solo cursa, con respuestas idénticas.
