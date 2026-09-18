# ADR 0001 · Modelo de roles y alcance por dependencia

**Estado:** aceptado · 2026-09-15
**Contexto del cambio:** PRD-01 (cuentas, dependencias y roles)

Primer ADR del repositorio. `docs/reglas.md` §3 y §15.4 exigen la carpeta desde
siempre; este es el primer cambio que de verdad la necesita, porque fija tres
decisiones que el resto del MVP da por hechas y que revisar más tarde costaría
una migración de datos.

## 1. Contexto

La plataforma venía de una plantilla con un RBAC plano de dos roles
(`ROLES = ["USER","ADMIN"]`) y **ninguna noción de pertenencia**: ninguna
operación del módulo `users` comprobaba a quién pertenecía el registro que
tocaba. El Instituto Digital de Capacitación necesita lo contrario: la
dependencia es lo que separa la operación, y un titular solo debe ver y
administrar a su gente.

## 2. Decisión

### 2.1 · Rol escalar en `User`, no tabla de membresías

Se amplía la tupla `ROLES` con `SUPERADMIN`, `DEPENDENCY_HEAD` y
`DEPENDENCY_DEPUTY`, y `User` gana una única `dependencyId`. No hay tabla
`rol_dependencia`.

**Por qué:** en el alcance del MVP una persona pertenece a exactamente una
dependencia, y una tabla de membresías cobraría su precio en cada consulta —un
join más en todo listado— a cambio de una flexibilidad que ninguna regla pide.
`USER` se reutiliza como participante en vez de introducir `PARTICIPANT`: evita
un backfill y es el valor por defecto que ya tiene la columna.

**Qué obligaría a revisarlo:** que alguien tenga que ejercer un rol en más de una
dependencia. Ese día se migra a tabla de membresías y hay que tocar tres sitios:
el claim, `resolveScope` y los filtros del repositorio.

### 2.2 · El alcance viaja en el access token

`accessTokenPayloadSchema` gana `dependencyId`. No se resuelve por petición.

**Por qué:** `role` ya es un claim con el mismo perfil de obsolescencia y la
maquinaria de invalidación ya está construida — `revokeUserTokens` sube el epoch
por usuario con el reloj de Postgres, `evaluateToken` lo compara en cada petición
con caché de proceso, y el refresh relee al usuario en cada rotación, así que el
claim se autocura. Resolverlo por petición costaría un `SELECT` a `auth.users` en
**cada petición autenticada**, que es justo lo que el diseño de
`docs/auth/02-revocacion-inmediata-epoch.md` se tomó el trabajo de evitar.

**La contrapartida, y cómo se paga:** toda mutación de rol o de dependencia
revoca los tokens del afectado. Sin eso el claim quedaría obsoleto hasta que
expirara el access token.

**Qué obligaría a revisarlo:** que aparezca una operación que escriba
`dependency_id` sin pasar por `changeDependency`, o que la ventana de obsolescencia
deje de ser aceptable.

### 2.3 · El alcance es un parámetro, no un valor del contenedor

`AccessScope` y `resolveScope` viven en `app/shared/auth/scope.rules.ts`. Cada
operación del repositorio y del servicio de `users` lo recibe **explícitamente**.

**Por qué:** así TypeScript falla en cada punto que lo olvide, y el hook
`pre-commit` corre `typecheck`. Al cambiar los puertos, el compilador señaló 44
puntos; ninguno pasó desapercibido. Un valor ambiental inyectado en el cradle
habría compilado en todos ellos, y además dejaría el servicio inutilizable desde
la semilla, donde no hay sesión de la que derivarlo.

**Refinamiento sobre el PRD:** las lecturas reciben `scope`; las mutaciones
reciben el `AuthContext` completo. El alcance solo cubre una de las dos
condiciones que una mutación debe cumplir; la otra es el rango, y un auxiliar y
su titular comparten dependencia, así que el alcance por sí solo dejaría al
auxiliar archivar a quien lo administra.

## 3. Consecuencias

**Lo que la base impone y la aplicación no puede:**

- `users_one_head_per_dependency`, índice único parcial: exactamente un titular
  por dependencia activa. La comprobación de la aplicación es una cortesía para
  dar buen mensaje; el índice es la regla, y es lo único que resiste dos
  designaciones simultáneas.
- `users_type_coherence`, CHECK: coherencia interno/externo. El
  superadministrador es el único interno exento de dependencia.

Prisma no expresa ninguna de las dos, así que van escritas a mano en la
migración.

**Fuera de alcance se ve igual que inexistente.** El filtro viaja junto a la
clave única en el `where`, así que Prisma lanza P2025 y se traduce a
`UserNotFoundError`. La excepción son las acciones que el actor sí conoce —
otorgar un rol superior, mover a alguien de rango superior—, que responden
`FORBIDDEN_SCOPE`: ahí un 404 le haría buscar un problema que no existe.

**Una excepción de frontera, y solo una.** `assignHead` escribe en `auth.users`
desde el repositorio de `dependencies`. Una transacción no puede repartirse entre
dos repositorios, y `docs/reglas.md` §8.1 exige frontera transaccional para una
escritura compuesta. Está documentada en el puerto.

**Riesgo asumido:** `User.role` sigue siendo texto libre en la base, sin enum
nativo. Una escritura externa con un rol inventado solo se cazaría al firmar el
token o al mapear la fila. Se mitigó en parte estrechando `userSchema.role` a la
tupla: ahora el mapper valida al leer, y la migración normaliza lo que hubiera.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Tabla de membresías `rol_dependencia` | Un join en cada listado por una flexibilidad que el alcance del MVP prohíbe explícitamente |
| Resolver la dependencia por petición | Un `SELECT` en cada petición autenticada, contra el diseño de revocación por epoch |
| Alcance inyectado en el cradle | Compila cuando se olvida, y deja el servicio inservible desde la semilla |
| Enum nativo de Postgres para `role` | Cada rol nuevo sería una migración; la tupla de valibot ya es el punto único de variación |
| Comprobar el alcance después de leer | Una rama olvidada devuelve la fila; en el `where` no hay rama que olvidar |

## 5. Actualización · 2026-09-18 — se retira `ADMIN`

`ADMIN` sobrevivía de la plantilla con alcance global sin figurar en el alcance
del MVP. Se retira de la tupla: todo lo que podía hacer —incluida la nube, que
era exclusiva suya— pasa a `SUPERADMIN`. La tupla queda en orden jerárquico
(`SUPERADMIN`, `DEPENDENCY_HEAD`, `DEPENDENCY_DEPUTY`, `USER`), que es el orden
en que la muestran selectores y filtros.

El cambio no lleva migración de datos. Una fila que conserve `role = 'ADMIN'`
deja de validar contra la tupla: no inicia sesión y rompe el mapeo de los
listados que la incluyan. Antes de desplegar hay que reasignar esas cuentas a
mano; en desarrollo basta con volver a correr el seed, que ya no crea ninguna.

El alcance de lockdown `except-admin` conserva su nombre porque es un valor
persistido: hoy exime solo a `SUPERADMIN`.
