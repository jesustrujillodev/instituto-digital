# Roles, perfil de capacitador y participación

## 1. Para qué sirve este documento

La plataforma responde tres preguntas distintas sobre cada persona, y cada una se
contesta de forma distinta:

| Pregunta | Cómo se llama | De dónde sale |
| --- | --- | --- |
| ¿Qué cargo tiene? | **Rol** | Un valor guardado en la cuenta |
| ¿Puede impartir cursos? | **Perfil de capacitador** | Un registro aparte, ligado a la cuenta |
| ¿Puede inscribirse a cursos? | **Participación** | No se guarda: se calcula con una regla |

Hay además un cuarto concepto que se deriva del rol, el **alcance**: hasta dónde
llega lo que la persona puede ver y administrar.

Confundir estas tres preguntas lleva a conclusiones equivocadas. Por ejemplo: el
rol `USER` se muestra en pantalla como "Participante", pero **no** es lo que
decide si alguien puede inscribirse. Un auxiliar no tiene ese rol y sí puede.

Cada afirmación de este documento lleva la referencia al archivo y a la línea
donde se comprueba.

---

## 2. Lo que se guarda en la cuenta

Todo parte de cuatro datos. Ninguno de los conceptos de este documento necesita
nada más.

| Dato | Dónde se guarda | Valores | Referencia |
| --- | --- | --- | --- |
| Rol | `auth.users.role` | Uno solo por persona | [`prisma/schema.prisma:23`](../../prisma/schema.prisma) |
| Tipo de cuenta | `auth.users.type` | `INTERNAL` (personal del Ayuntamiento) o `EXTERNAL` | [`prisma/schema.prisma:28`](../../prisma/schema.prisma), [`:208-213`](../../prisma/schema.prisma) |
| Dependencia | `auth.users.dependency_id` | Una o ninguna | [`prisma/schema.prisma:39`](../../prisma/schema.prisma) |
| Perfil de capacitador | Fila en `org.trainer_profiles` | Existe o no existe; si existe, está activo o desactivado | [`prisma/schema.prisma:258-272`](../../prisma/schema.prisma) |

La base de datos impone una regla que une tipo, rol y dependencia
([`migration.sql:113-118`](../../prisma/migrations/20260915183000_organizacion_dependencias_y_roles/migration.sql)):

- Una cuenta **externa** no tiene dependencia ni número de empleado.
- Una cuenta **interna** tiene número de empleado y dependencia. La única
  excepción es el superadministrador, que puede no tener dependencia.

---

## 3. Rol

### 3.1 · Definición

El rol es **el cargo administrativo** de la persona dentro de la plataforma. Cada
persona tiene **exactamente uno**.

Los valores posibles están declarados en un solo lugar,
[`app/shared/rules/atoms.rules.ts:42-47`](../../app/shared/rules/atoms.rules.ts),
y el texto que ve el usuario en
[`app/modules/users/components/user-badges.tsx:12-17`](../../app/modules/users/components/user-badges.tsx):

| Valor en código | Texto en pantalla | Qué administra |
| --- | --- | --- |
| `SUPERADMIN` | Superadministrador | Toda la plataforma |
| `DEPENDENCY_HEAD` | Titular | Su dependencia. Designa y retira auxiliares |
| `DEPENDENCY_DEPUTY` | Auxiliar | Su dependencia, igual que el titular salvo gestionar auxiliares |
| `USER` | Participante | Nada más que su propia cuenta |

### 3.2 · Por qué es un solo valor

El [ADR 0001 §2.1](../adr/0001-modelo-de-roles-y-alcance-por-dependencia.md)
decidió guardar el rol como una columna de la cuenta y no en una tabla aparte que
permitiera varios roles por persona. La razón: una tabla aparte añadiría una
consulta extra a cada listado, y en este sistema una persona pertenece a una sola
dependencia.

La consecuencia es que **el rol no puede expresar "además de"**. Si alguien es
auxiliar, su rol es `DEPENDENCY_DEPUTY` y nada más. Todo lo que una persona puede
hacer además de su cargo (impartir, inscribirse) tiene que resolverse fuera del
rol. Las secciones 4 y 5 explican cómo.

### 3.3 · Reglas que gobiernan el rol

| Regla | Referencia |
| --- | --- |
| Solo hay un titular activo por dependencia; lo garantiza un índice único de la base | [`migration.sql:107-109`](../../prisma/migrations/20260915183000_organizacion_dependencias_y_roles/migration.sql) |
| Qué rol puede otorgar cada rol (el titular no se otorga desde aquí, se designa desde la dependencia) | [`app/modules/users/domain/user.access.rules.ts:43-49`](../../app/modules/users/domain/user.access.rules.ts) |
| El orden entre roles, usado solo para comparar | [`app/modules/users/domain/user.access.rules.ts:23-29`](../../app/modules/users/domain/user.access.rules.ts) |
| Quien cambia de dependencia deja de ser titular o auxiliar y vuelve a `USER` | [`app/modules/users/domain/user.access.rules.ts:222-225`](../../app/modules/users/domain/user.access.rules.ts) |
| Cambiar el rol cierra las sesiones del afectado | [`app/modules/users/application/users.service.server.ts:236-240`](../../app/modules/users/application/users.service.server.ts) |

La última regla existe porque el rol viaja firmado dentro del token de acceso
([`app/modules/auth/domain/auth.rules.ts:31`](../../app/modules/auth/domain/auth.rules.ts)).
Sin cerrar las sesiones, la persona seguiría operando con el rol anterior hasta
que el token expirara
([ADR 0001 §2.2](../adr/0001-modelo-de-roles-y-alcance-por-dependencia.md)).

---

## 4. Perfil de capacitador

### 4.1 · Definición

El perfil de capacitador es **un registro que se agrega a una cuenta** para
indicar que esa persona puede impartir cursos. **No es un rol** y no reemplaza al
rol que ya tenga: se suma a él.

Un auxiliar con perfil de capacitador sigue teniendo rol `DEPENDENCY_DEPUTY` y,
además, puede impartir.

### 4.2 · Cómo se guarda

- Es una fila en `org.trainer_profiles` cuya llave es el id de la cuenta
  ([`prisma/schema.prisma:258-260`](../../prisma/schema.prisma)). Por eso una
  persona tiene **como máximo un** perfil.
- Está **activo** si su campo `archivedAt` está vacío
  ([`prisma/schema.prisma:266`](../../prisma/schema.prisma)). Desactivarlo no
  lo borra, para conservar el historial de lo impartido.
- El sistema lo resume en un valor verdadero/falso llamado `isTrainer`, que se
  calcula al leer la cuenta y no se guarda en ninguna columna
  ([`app/modules/users/domain/user.mapper.ts:8-11`](../../app/modules/users/domain/user.mapper.ts)).
- `isTrainer` viaja firmado dentro del token de acceso, junto al rol
  ([`app/modules/auth/domain/auth.rules.ts:47-48`](../../app/modules/auth/domain/auth.rules.ts)).
  Por eso activar, desactivar o reactivar el perfil cierra las sesiones del
  afectado
  ([`app/modules/trainers/application/trainers.service.server.ts:143`](../../app/modules/trainers/application/trainers.service.server.ts),
  [`:171`](../../app/modules/trainers/application/trainers.service.server.ts),
  [`:181`](../../app/modules/trainers/application/trainers.service.server.ts)).

### 4.3 · Por qué no es un rol

El [ADR 0002 §2.1](../adr/0002-perfil-de-capacitador-y-transaccion-entre-modulos.md)
lo decide así: como el rol es un solo valor (§3.2), un rol `TRAINER` obligaría a
elegir entre ser auxiliar o ser capacitador. La tabla de alternativas descartadas
del mismo ADR (§4) lo dice en una línea: con un rol `TRAINER` "nadie podría ser
auxiliar y capacitador a la vez".

El ADR también descarta una tabla de capacitadores separada de las cuentas,
porque partiría en dos el historial de quien cursa e imparte, y le exigiría dos
accesos.

### 4.4 · Qué permite

| Qué | Condición exacta | Referencia |
| --- | --- | --- |
| Consultar el catálogo de capacitadores | Tener rol de gestión **o** perfil activo | [`app/modules/trainers/domain/trainer.access.ts:33-35`](../../app/modules/trainers/domain/trainer.access.ts) |
| Crear cursos y administrar los que creó | Perfil activo **y** tener dependencia (solo si su rol no le da ya un alcance mayor) | [`app/modules/courses/domain/course.access.ts:52-74`](../../app/modules/courses/domain/course.access.ts) |
| Ver los cursos que imparte | Perfil activo y estar asignado al curso | [`app/modules/courses/domain/course.access.ts:255-257`](../../app/modules/courses/domain/course.access.ts) |
| Ver en el menú los enlaces marcados para capacitadores | Perfil activo, sin importar el rol | [`app/shared/layout/navigation.utils.ts:16-20`](../../app/shared/layout/navigation.utils.ts) |

### 4.5 · Capacitador interno y capacitador externo

| | Interno | Externo |
| --- | --- | --- |
| Tipo de cuenta | `INTERNAL` | `EXTERNAL` |
| Rol | El que tenga | `USER` |
| Dependencia | Sí | No (lo impone la base, §2) |
| Imparte | Sí | Sí |
| Crea cursos | Sí, en su dependencia | No: sin dependencia no hay dónde crearlos |
| Se inscribe a cursos | Sí, si cumple la participación (§5) | No: sin dependencia no cumple la participación |

La pantalla de alta del externo lo resume en su descripción
([`app/modules/trainers/routes/capacitadores/nuevo/index.tsx:57`](../../app/modules/trainers/routes/capacitadores/nuevo/index.tsx)).

---

## 5. Participación

### 5.1 · Definición

Participar es **poder inscribirse a cursos, recibir invitaciones y aparecer en
"Mis cursos"**. No es un rol ni un perfil, y no se guarda en ningún lado: se
calcula cada vez con una sola función.

### 5.2 · La regla

[`app/modules/enrollments/domain/enrollment.rules.ts:60-66`](../../app/modules/enrollments/domain/enrollment.rules.ts):

```ts
const NON_PARTICIPANT_ROLES: readonly Role[] = ["SUPERADMIN"];

export const canParticipate = (actor) =>
	actor.dependencyId !== null && !NON_PARTICIPANT_ROLES.includes(actor.role);
```

Dicho en palabras: **participa quien pertenece a una dependencia y no tiene un
rol de alcance global.**

La regla está escrita en negativo: no enumera quién participa, sino quién no.
Por eso cualquier rol de dependencia participa sin que haga falta nombrarlo.

### 5.3 · Resultado por caso

Los casos están fijados en la prueba
[`app/modules/enrollments/domain/__tests__/enrollment.rules.test.ts:26-37`](../../app/modules/enrollments/domain/__tests__/enrollment.rules.test.ts):

| Rol | Dependencia | ¿Participa? | Motivo |
| --- | --- | --- | --- |
| `USER` | Sí | Sí | Cumple las dos condiciones |
| `DEPENDENCY_HEAD` | Sí | Sí | Cumple las dos condiciones |
| `DEPENDENCY_DEPUTY` | Sí | Sí | Cumple las dos condiciones |
| `USER` | No | No | Sin dependencia (el capacitador externo está en este caso) |
| `SUPERADMIN` | Cualquiera | No | Rol de alcance global |

El perfil de capacitador **no interviene**: ni lo da ni lo quita.

### 5.4 · Dónde se aplica

| Lugar | Qué hace | Referencia |
| --- | --- | --- |
| Acceso a "Cursos disponibles" y "Mis cursos" | Responde 403 a quien no participa | [`app/modules/enrollments/routes/require-participant.server.ts:15-24`](../../app/modules/enrollments/routes/require-participant.server.ts) |
| Servicio de inscripción | Rechaza la operación con un error de dominio | [`app/modules/enrollments/application/enrollments.service.server.ts:101-106`](../../app/modules/enrollments/application/enrollments.service.server.ts) |
| Calendario | Decide si se muestran los cursos que la persona cursa | [`app/modules/calendar/domain/calendar.rules.ts:40`](../../app/modules/calendar/domain/calendar.rules.ts) |

### 5.5 · Dos detalles que confunden

1. **El menú usa una aproximación por rol.** Los enlaces "Cursos disponibles" y
   "Mis cursos" se muestran a `USER`, `DEPENDENCY_HEAD` y `DEPENDENCY_DEPUTY`
   ([`app/shared/layout/navigation.config.ts:86-97`](../../app/shared/layout/navigation.config.ts)).
   El menú no conoce la dependencia, así que el capacitador externo (rol `USER`)
   ve los enlaces y al entrar recibe 403. La lista `PARTICIPANT_ROLES`
   ([`require-participant.server.ts:9-13`](../../app/modules/enrollments/routes/require-participant.server.ts))
   solo se usa para redactar ese mensaje de 403; la decisión la toma
   `canParticipate`.
2. **"Participante" en pantalla es el nombre del rol `USER`, no de la
   participación.** Un titular aparece como "Titular" y aun así participa.

### 5.6 · Dónde está documentada

El [ADR 0004 §3](../adr/0004-inscripcion-una-fila-y-cupo-con-bloqueo.md), en su
tabla de invariantes, registra "Externos y roles globales no cursan →
`canParticipate`", y
[`docs/enrollments/00-inscripcion-e-invitaciones.md`](../enrollments/00-inscripcion-e-invitaciones.md)
§4 y §5 describen quién ve y usa las pantallas.

Ningún ADR dice de forma explícita que el titular y el auxiliar participan; se
deduce de la regla, que solo excluye a los roles globales y a quien no tiene
dependencia.

---

## 6. Alcance

### 6.1 · Definición

El alcance es **hasta dónde llega lo que una persona puede ver y administrar**.
No se guarda: se calcula a partir del rol y de la dependencia que viajan en el
token de acceso, nunca de lo que pida la URL
([`app/shared/auth/scope.rules.ts:22-31`](../../app/shared/auth/scope.rules.ts)).

### 6.2 · Alcance general

[`app/shared/auth/scope.rules.ts:16-57`](../../app/shared/auth/scope.rules.ts):

| Rol | Alcance | Significado |
| --- | --- | --- |
| `SUPERADMIN` | `global` | Todo |
| `DEPENDENCY_HEAD`, `DEPENDENCY_DEPUTY` con dependencia | `dependency` | Lo de su dependencia |
| `DEPENDENCY_HEAD`, `DEPENDENCY_DEPUTY` sin dependencia | `none` | Nada (caso de datos inconsistentes) |
| `USER` | `self` | Solo lo propio |

El [ADR 0001 §2.3](../adr/0001-modelo-de-roles-y-alcance-por-dependencia.md)
explica por qué cada operación lo recibe como parámetro explícito.

### 6.3 · Alcance para cursos

El módulo de cursos necesita un caso que el alcance general no tiene: el
capacitador interno administra **los cursos que él creó** dentro de su
dependencia. Por eso tiene su propio cálculo
([`app/modules/courses/domain/course.access.ts:30-74`](../../app/modules/courses/domain/course.access.ts)),
que es el único lugar donde el perfil de capacitador afecta al alcance:

| Condición | Alcance para cursos |
| --- | --- |
| Alcance general `global` | `global` |
| Alcance general `dependency` | `dependency` |
| Cualquier otro caso, con perfil activo y dependencia | `creator`: solo los cursos que creó |
| El resto (incluido el capacitador externo) | `none` |

Si una persona es titular y además capacitadora, conserva el alcance mayor
(`dependency`). La decisión está en el
[ADR 0003 §2.1](../adr/0003-alcance-de-cursos-y-audiencia.md).

### 6.4 · Alcance y participación son cosas distintas

El alcance responde "qué puedo **administrar**"; la participación, "puedo
**inscribirme**". Un titular tiene alcance `dependency` para administrar los
cursos de su dependencia y, por separado, participa. Los cursos que ve para
inscribirse los decide otra regla, `courseVisibilityWhere`
([`app/modules/courses/domain/course.access.ts:248-291`](../../app/modules/courses/domain/course.access.ts)),
que junta lo que administra, lo que imparte, lo publicado para su dependencia o
sus grupos y aquello en lo que ya está invitado o inscrito.

---

## 7. La otra "página de perfil"

La palabra "perfil" también nombra la página donde cada persona consulta su
propia cuenta, `/dashboard/perfil`
([`app/modules/users/routes/routes.config.ts:8`](../../app/modules/users/routes/routes.config.ts)).
No tiene relación con el perfil de capacitador: solo exige haber iniciado sesión
([`app/modules/users/routes/perfil/index.loader.ts:9-15`](../../app/modules/users/routes/perfil/index.loader.ts)).

Para evitar ambigüedad, en este repositorio conviene escribir siempre **"perfil
de capacitador"** completo cuando se habla del registro de §4.

---

## 8. Ejemplos combinados

| Persona | Rol | Tipo | Dependencia | Perfil de capacitador | Participa | Alcance general | Alcance para cursos |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Personal sin cargo | `USER` | Interno | Sí | No | Sí | `self` | `none` |
| Personal que imparte | `USER` | Interno | Sí | Activo | Sí | `self` | `creator` |
| Auxiliar | `DEPENDENCY_DEPUTY` | Interno | Sí | No | Sí | `dependency` | `dependency` |
| Auxiliar que imparte | `DEPENDENCY_DEPUTY` | Interno | Sí | Activo | Sí | `dependency` | `dependency` |
| Titular | `DEPENDENCY_HEAD` | Interno | Sí | No | Sí | `dependency` | `dependency` |
| Capacitador externo | `USER` | Externo | No | Activo (obligatorio) | No | `self` | `none` |
| Superadministrador | `SUPERADMIN` | Interno | No | No | No | `global` | `global` |

Cada columna se lee de forma independiente:

- **Participa** sale de §5.2.
- **Alcance general** sale de §6.2.
- **Alcance para cursos** sale de §6.3.

---

## 9. Referencias

**Decisiones de arquitectura**

- [ADR 0001](../adr/0001-modelo-de-roles-y-alcance-por-dependencia.md): rol
  como un solo valor (§2.1), rol y dependencia dentro del token (§2.2), alcance
  como parámetro (§2.3).
- [ADR 0002](../adr/0002-perfil-de-capacitador-y-transaccion-entre-modulos.md):
  perfil de capacitador como registro que se suma a la cuenta (§2.1), `isTrainer`
  dentro del token (§2.2), alternativas descartadas (§4).
- [ADR 0003](../adr/0003-alcance-de-cursos-y-audiencia.md): alcance propio de
  cursos y el caso `creator` (§2.1).
- [ADR 0004](../adr/0004-inscripcion-una-fila-y-cupo-con-bloqueo.md): tabla de
  invariantes con `canParticipate` (§3), visibilidad por inscripción (§2.3).

**Documentación técnica relacionada**

- [`docs/dependencies/00-dependencias-y-alcance.md`](../dependencies/00-dependencias-y-alcance.md): tabla de roles y aislamiento por dependencia.
- [`docs/trainers/00-capacitadores-y-grupos.md`](../trainers/00-capacitadores-y-grupos.md): perfil de capacitador e `isTrainer`.
- [`docs/courses/00-cursos-sesiones-y-acceso.md`](../courses/00-cursos-sesiones-y-acceso.md): alcance de cursos.
- [`docs/enrollments/00-inscripcion-e-invitaciones.md`](../enrollments/00-inscripcion-e-invitaciones.md): quién se inscribe, asigna e invita.
