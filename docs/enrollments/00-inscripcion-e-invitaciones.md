# Inscripción e invitaciones — Referencia

## 1. Qué es

El módulo `app/modules/enrollments` cubre §6.6 del alcance:

- cursos disponibles;
- inscripción propia contra el cupo;
- baja voluntaria;
- asignación por titular o auxiliar;
- invitación a personas o grupos, con aceptar o rechazar;
- "Mis cursos".

Las decisiones de modelo están en `docs/adr/0004-inscripcion-una-fila-y-cupo-con-bloqueo.md`.

| Pendiente | PRD |
| --- | --- |
| Correos de invitación, inscripción y asignación | PRD-08 |
| Sesiones inscritas en el calendario | PRD-05 |
| Asistencia, `result` definitivo, nota y crédito | PRD-06 |

## 2. El modelo

`org.enrollments`, una fila por `(course_id, user_id)`:

| Columna | Qué guarda |
| --- | --- |
| `dependency_id` | La dependencia de la persona al inscribirse o al aceptar. Si se cambia después, la fila no cambia |
| `origin` | `SELF`, `ASSIGNED` o `INVITATION` |
| `status` | `INVITED`, `ENROLLED`, `DECLINED` o `WITHDRAWN` |
| `result` | `PENDING` hasta PRD-06 |
| `acted_by_id` | Quién hizo el último cambio: la persona, quien asignó o quien invitó |
| `invited_at`, `enrolled_at`, `responded_at`, `withdrawn_at` | Marca del último evento de cada tipo |

### Máquina de estados

```
(ninguna) ──invitar──▶ INVITED ──aceptar──▶ ENROLLED ──baja──▶ WITHDRAWN
    │                     │                    ▲                  │
    └──inscribirse/asignar┼────────────────────┘                  │
                          └──rechazar──▶ DECLINED                 │
            DECLINED y WITHDRAWN vuelven a INVITED o ENROLLED ◀───┘
```

La tabla vive en `canTransition` (`domain/enrollment.rules.ts`). Toda escritura
del servicio pasa por ella antes de llegar al repositorio.

## 3. Reglas

| Regla | Dónde |
| --- | --- |
| La inscripción cierra en la fecha límite o, sin ella, al empezar la primera sesión | `enrollmentClosesAt`, `isEnrollmentOpen` |
| Solo cursos `PUBLISHED` admiten inscribirse, aceptar, asignar o invitar | `isEnrollmentOpen` |
| La baja se permite hasta que empiece la primera sesión | `canWithdraw` |
| Inscribirse, aceptar y asignar ocupan lugar; invitar no | `assertSeatsFor` en `enroll`, `accept` y `assign` |
| Solo cursa quien tiene dependencia y no tiene rol global | `canParticipate` (externos, `SUPERADMIN` y `ADMIN` quedan fuera) |
| Asignar es todo o nada: si no hay cupo para el lote, nadie entra | `assign` |
| Invitar omite a quien ya está `INVITED` o `ENROLLED` y reinvita a quien rechazó o se dio de baja | `invite` |

El instante actual llega por el cradle (`clock`) para probar estas reglas con
fechas fijas.

## 4. Quién hace qué

| Operación | Quién | Alcance |
| --- | --- | --- |
| Ver cursos disponibles, inscribirse, baja, aceptar, rechazar | Quien cumple `canParticipate` | Lo que ve según `courseVisibilityWhere` |
| Asignar (desde el detalle o desde Inscripciones) | Superadministrador, titular, auxiliar, capacitador interno | Superadministrador: cualquier curso y persona. Titular y auxiliar: cursos que ve su dependencia (`dependencyVisibilityWhere`). Capacitador: los que creó. En los tres últimos, solo personal de su dependencia |
| Invitar personas o grupos | Los mismos | Cursos que administran; grupos de `toAudienceScope` |
| Ver la lista de inscritos | Los mismos | `courseScopeWhere` |

Un curso fuera de alcance responde **404**, igual que uno inexistente.

## 5. Rutas

| Ruta | Guard | Pantalla |
| --- | --- | --- |
| `/dashboard/cursos-disponibles` | `requireParticipant` | Publicados, visibles y con la inscripción abierta |
| `/dashboard/cursos-disponibles/:documentId` | `requireParticipant` | Detalle con sesiones, lugares y cierre. Intents `enroll`, `withdraw`, `accept`, `decline`, `assign` |
| `/dashboard/mis-cursos` | `requireParticipant` | Invitaciones pendientes, más próximos, en curso y finalizados. Intents `accept`, `decline` |
| `/dashboard/cursos/:documentId/inscripciones` | `requireCourseScope` | Lista de inscritos e invitados. Intents `invite` y `assign` |

El menú muestra "Cursos disponibles" y "Mis cursos" a `USER`, `DEPENDENCY_HEAD` y
`DEPENDENCY_DEPUTY`. El capacitador externo tiene rol `USER` y ve los enlaces,
pero su loader le responde 403, la misma limitación que ya tiene "Cursos".

## 6. Concurrencia

- **Cupo:** `lockCourseSeats` bloquea la fila del curso con `FOR UPDATE` dentro
  de `runInTransaction` y cuenta los `ENROLLED`. Editar el cupo del curso usa el
  mismo bloqueo.
- **Doble envío:** `save` actualiza solo si la fila sigue en el estado leído. Si
  no, o si dos altas chocan con la unicidad, responde `ENROLLMENT_STATE_CHANGED`.

## 7. Lo que queda enganchado

- **PRD-08:** los avisos se disparan tras `enroll`, `assign` e `invite` en
  `enrollments.service.server.ts`, fuera de la transacción y sin bloquear la
  operación (§6.12).
- **PRD-05:** el calendario del participante sale de `findMine`, con las
  invitaciones marcadas aparte.
- **PRD-06:** escribe `result` y el crédito sobre la misma fila
  `(course_id, user_id)`.
