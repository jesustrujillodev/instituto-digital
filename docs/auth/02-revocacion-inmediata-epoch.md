# Revocación inmediata por epoch de validez — Referencia

**Última actualización:** 2026-07-31 · Este documento describe el mecanismo de
revocación **como está implementado**. Es la Fase A de un diseño de dos fases;
el **lockdown** (bloquear refresh y logins nuevos) es la Fase B y está
implementado y documentado en [03-lockdown.md](./03-lockdown.md).

Complementa a [00-sistema-autenticacion.md](./00-sistema-autenticacion.md), que
describe el sistema de identidad completo.

---

## 1. Qué resuelve

Antes de esto, revocar una sesión cortaba la **renovación**, no el acceso en
curso: el middleware confía en la firma del access token y no consulta la base
de datos, así que el dispositivo revocado seguía navegando hasta que su token
expiraba. La ventana era exactamente `AUTH_ACCESS_TOKEN_TTL_S` — 5 minutos.

Ahora existe un **epoch de validez**: un instante contra el que se compara el
`iat` de cada token.

```
si (payload.iat < epoch) → el token no vale, aunque su firma sea correcta
```

Cerrar el acceso deja de ser esperar y pasa a ser **escribir una fecha**.

Es *not-before* del lado del verificador: la misma idea que el claim `nbf` del
JWT, pero como política del servidor en vez de dentro del token — que es
justamente lo que permite cambiarla sin reemitir nada. Es también el mecanismo
que Firebase Auth expone como `revokeRefreshTokens()` / `tokensValidAfterTime`.

**Lo que este mecanismo por sí solo no resuelve:** cerrar la plataforma. Subir
el epoch mata los tokens vivos, pero cualquiera con un refresh token válido
acuña uno nuevo un segundo después. Bloquear también eso es el **lockdown**
(Fase B, [03-lockdown.md](./03-lockdown.md)).

## 2. Las dos granularidades

| Epoch | Dónde vive | Qué mata |
|---|---|---|
| **Global** | `auth.security_state.tokens_valid_after` (fila única, id = 1) | Todos los access tokens vivos de la plataforma |
| **Por usuario** | `auth.users.tokens_valid_after` (nullable) | Solo los de esa cuenta |

No hay epoch por **sesión**, y no es un olvido: un token no dice de qué sesión
salió. Cortar una sesión concreta al instante exigiría introspección por
petición (verificar contra la base de datos en cada request), que invierte la
decisión que sostiene todo el diseño: el JWT existe precisamente para no
tocar la base de datos en el camino caliente.

### Por qué el epoch por usuario no reintroduce la introspección

Es el punto de diseño clave de esta fase.

Un epoch de usuario solo puede invalidar tokens durante
`AUTH_ACCESS_TOKEN_TTL_S`: pasado ese tiempo, **todo token emitido antes de él
ya expiró por su cuenta**, así que la fila deja de poder decidir nada. El lector
lo aprovecha y consulta solo los epochs vigentes:

```sql
WHERE tokens_valid_after > now() - accessTokenTtlS
```

Típicamente eso son **cero filas**. Y esa consulta se ejecuta una vez por TTL de
caché, compartida por todas las peticiones del proceso — no una vez por
petición, ni una vez por usuario. La lectura no crece con el histórico de
revocaciones ni con el número de sesiones.

## 3. Piezas

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Dominio | `domain/security-state.repository.ts` | Puerto `SecurityStateRepository` + `SecuritySnapshot` |
| Dominio | `domain/security-state.rules.ts` | `evaluateToken(payload, snapshot)` — la decisión, pura |
| Dominio | `domain/auth.rules.ts` | `verifiedAccessTokenPayloadSchema` (el que exige `iat`) |
| Infraestructura | `infrastructure/security-state.repository.server.ts` | Adaptador Prisma |
| Infraestructura | `infrastructure/security-state.cache.server.ts` | Decorador con caché de N segundos |
| Arranque | `shared/di/container.server.ts` | Punto de corte en el middleware + cableado |

La decisión vive en una función **pura**, sin I/O ni framework: recibe los
claims y una foto del estado y devuelve un veredicto. Es la pieza que de verdad
decide y la más fácil de probar.

## 4. `iat`: dos esquemas, no un campo opcional

`signAccessToken` ya emitía `iat` (`.setIssuedAt()` de jose), pero
`accessTokenPayloadSchema` es un `v.object` y las claves no declaradas se
descartan: el dato llegaba y se tiraba.

La corrección **no** fue añadir `iat` al esquema de firma — en el momento de
firmar aún no existe, lo pone jose. Son dos esquemas:

- `accessTokenPayloadSchema` — lo que se **firma**. Sin `iat`.
- `verifiedAccessTokenPayloadSchema` — lo que sale de **verificar**. Con `iat`
  obligatorio.

Que sea obligatorio y no opcional es deliberado: sin `iat` no hay nada que
comparar contra el epoch, y un token **inevaluable se trata como inválido**, no
como válido. `verifyAccessToken` devuelve `null` en ese caso, igual que ante una
firma rota.

`VerifiedAccessTokenPayload` es un superconjunto de `AccessTokenPayload`, así
que `requireAuth`, `requireRole` y `session-user.ts` no cambiaron.

## 5. El ciclo de una petición, con el corte

```
Petición con access token
  │
  ├─ verifyAccessToken(cookie)        firma + alg + issuer + audience + iat
  │     └─ null → rama de silent refresh (ya existía)
  │
  ├─ securityState.get()              memoria el 99,99 % de las veces
  │
  ├─ evaluateToken(payload, snapshot)
  │     · iat < epoch global   → rechazado (GLOBAL_EPOCH)
  │     · iat < epoch de user  → rechazado (USER_EPOCH)
  │     · si no                → permitido
  │
  └─ rechazado → cae en la rama de SILENT REFRESH QUE YA EXISTE
        · sesión viva  → acuña un token con iat > epoch y sigue dentro
        · sesión muerta → refresh falla → limpia cookies → login
```

No se añadió una salida nueva: se reutiliza la degradación existente, que ya
está probada y ya limpia cookies antes de redirigir.

**Efecto colateral que cierra un hueco.** `refresh` cachea su resultado en el
single-flight durante `AUTH_REFRESH_GRACE_S` (60 s). Antes, un token acuñado
justo antes de una revocación podía seguir sirviéndose durante esa ventana. Con
el epoch, ese token cacheado tiene `iat < epoch` y el middleware lo rechaza en
la petición siguiente. No hizo falta tocar el single-flight.

## 6. Configuración

| Variable | Default | Uso |
|---|---|---|
| `AUTH_SECURITY_STATE_CACHE_TTL_S` | `5` | Cuánto se cachea el estado en memoria |

Ese TTL **es** la ventana de propagación del corte entre nodos, y es el único
dial del mecanismo:

| TTL | Propagación | Coste por petición |
|---|---|---|
| 0 | inmediata real | 1 lectura al store en **cada** petición |
| 5 s (actual) | ≤ 5 s | ~0 (memoria) |
| 60 s | ≤ 60 s | ~0 |

5 segundos deja el corte 60 veces más rápido que la ventana anterior de 5
minutos manteniendo el coste del caso normal en cero. El proceso que **ejecuta**
la revocación invalida su propia caché al escribir, así que para él el corte es
inmediato aunque los demás nodos tarden hasta el TTL.

## 7. Los dos puntos donde es fácil equivocarse

### 7.1 Modo de fallo: hacia dónde cae si el store no responde

**Si solo se revisa una línea de toda la implementación, que sea ésta**
(`security-state.cache.server.ts`):

| Situación | Comportamiento | Por qué |
|---|---|---|
| El store falla y **hay** valor cacheado | Sirve el **último valor conocido** | Si había un corte, sigue habiéndolo |
| El store falla y **no** hay nada cacheado (arranque en frío con la base caída) | **Relanza** ⇒ el middleware **deniega** | Coherente con el fail-fast de `env.server.ts`: mejor no servir que servir degradado |

Un `catch` que devolviera "sin revocaciones" ante un error convertiría una caída
de la base de datos en la **apertura automática de la plataforma**. El puerto lo
declara explícitamente: `get()` lanza, y nunca devuelve un estado por defecto.

En frío el usuario acaba en login, no en un error: el rechazo cae en la rama de
refresh, que también fallará con la base caída, y esa rama ya limpia cookies y
redirige.

### 7.2 La hora la pone el store, nunca el proceso

Todas las escrituras de epoch usan `now()` de Postgres vía `$executeRaw`, no
`new Date()` del proceso.

Con varios nodos, uno con el reloj adelantado que escribiera su propia hora
invalidaría tokens legítimos durante todo el desfase; uno atrasado dejaría vivos
los que debía matar. Usar la hora de la base elimina la clase de error entera.

### 7.3 Precisión de `iat` — y por qué no se "arregla"

`iat` es un entero en **segundos**; el epoch tiene milisegundos. La comparación
trunca, así que un token acuñado microsegundos *después* del corte puede
rechazarse.

Es el sentido correcto del error: **falla hacia cerrado** y se autocorrige solo
(el cliente cae en silent refresh, acuña uno nuevo y sigue). No debe
"corregirse" con un margen de tolerancia: un margen es exactamente una ventana
por la que se cuela lo que se quería cortar.

## 8. Latencia por acción del monitor de sesiones

`/dashboard/sesiones` (§6.5 de auth/00) queda así:

| Acción | Qué hace | Latencia real |
|---|---|---|
| Revocar **una** sesión | `deleteById` — sin tocar epochs | ≤ `AUTH_ACCESS_TOKEN_TTL_S` (5 min) |
| Revocar **las de un usuario** | `deleteAllByUserId` + epoch del usuario | **inmediata** (≤ TTL de caché) |
| **Cerrar todas** | `deleteAllExcept` + epoch **global** | **inmediata** para todos |
| Limpiar expiradas | `deleteExpired` | n/a (higiene de datos) |

La pantalla dice ambos números y los lee del loader, no de literales: si cambia
una variable de entorno, la copia no miente.

### Por qué "Cerrar todas" no expulsa a quien la ejecuta

Es contraintuitivo y es correcto. El epoch global mata **también** el access
token del operador — no admite excepciones por token, y no las necesita: su
*sesión* sobrevive al borrado (`deleteAllExcept`), así que en su siguiente
petición cae en el silent refresh que ya existe, acuña un token con
`iat > epoch` y sigue navegando. Un refresh extra, cero fricción.

Los demás no tienen sesión que renovar, así que su refresh falla y acaban en
login.

## 9. Modelo de datos

```prisma
SecurityState {              // tabla auth.security_state, fila única id = 1
  id                1
  tokensValidAfter  DateTime      // epoch global
  lockdownAt?       DateTime      // ── inertes en esta fase ──
  lockdownScope?    "all" | "except-admin"
  lockdownReason?   String        // interno, NUNCA al cliente
  lockdownBy?       Int           // auditoría
  updatedAt         DateTime
}

User { ..., tokensValidAfter? DateTime }   // epoch por usuario, con índice
```

**Las columnas de lockdown** se sembraron en esta misma migración y las lee el
lockdown de la Fase B ([03-lockdown.md](./03-lockdown.md)): no hizo falta un
segundo cambio de esquema.

**Fila única.** Prisma no expresa un `CHECK (id = 1)`; se garantiza por
convención — toda escritura es un upsert sobre `id = 1`. La fila se siembra en
`prisma/seed.ts` con `update: {}`, para que re-sembrar un entorno **no** reabra
un corte ya aplicado.

Si la fila falta, el adaptador **lanza** (y por §7.1 el sistema deniega). Es
preferible a comportarse como si nunca se hubiera revocado nada.

**`tokensValidAfter` en `users` es propiedad del módulo `auth`.** El módulo
`users` la ignora y no la proyecta en `SafeUser`.

## 10. Amenaza → defensa (lo que añade esta fase)

| Amenaza | Antes | Ahora |
|---|---|---|
| Cuenta comprometida detectada | Seguía escribiendo hasta 5 min | Fuera en ≤ 5 s con "revocar las de este usuario" |
| Dispositivo robado | Ídem | Ídem (el corte es por cuenta) |
| Sospecha general, sin vector claro | Nada que hacer desde la app | "Cerrar todas" corta a todos de inmediato |
| Caída de la base de datos | n/a | **No abre**: último valor conocido, o denegar en frío |
| Desfase de reloj entre nodos | n/a | La hora la pone Postgres |

Por sí solo, este mecanismo es **revocación**, no **cierre**: un refresh token
válido permitiría volver a entrar un segundo después de subir el epoch, y un
login con contraseña también. Eso es lo que añade el **lockdown**
([03-lockdown.md](./03-lockdown.md)), que también está implementado.

## 11. Pendientes conocidos

- **Revocación por sesión:** sigue teniendo la ventana del TTL. Solo se
  cerraría con introspección por petición, descartada por diseño.
- **Auditoría persistida:** las revocaciones se registran en el log, pero no hay
  tabla de eventos separada (pendiente general del proyecto).
- **Multi-nodo real:** la caché es por proceso. Es correcto (propaga en ≤ TTL) y
  no requiere Redis; un store compartido no lo haría instantáneo, solo movería
  la caché de sitio.
- **Multi-tenancy:** con una base por tenant, el epoch resulta naturalmente por
  tenant. Un corte de *toda* la plataforma exigiría iterar tenants — decisión a
  tomar el día que se aborde multi-tenancy, no hoy.

## 12. Cómo replicarlo en otro proyecto

Se lleva tal cual (agnóstico): `domain/security-state.repository.ts` (puerto) y
`domain/security-state.rules.ts` (la decisión). No dependen de nada.

Se reescribe por stack:

1. **Persistencia** — el adaptador. Lo único no trivial es que la hora la
   escriba el store (§7.2) y que la lectura de epochs de usuario vaya acotada
   por el horizonte del TTL (§2).
2. **Caché** — el decorador es genérico salvo por el modo de fallo, que hay que
   portar **literalmente**: último valor conocido, o lanzar en frío (§7.1).
3. **Punto de corte** — donde el framework verifique el token, comparar el
   veredicto y degradar por el camino de "no autenticado" que ya exista.

Trampa de cableado, si se usa un contenedor DI: la caché debe ser un **singleton
de proceso**. Aquí el contenedor es por petición, así que registrarla como
singleton *del contenedor* daría una instancia por request y no cachearía nada
— va con `asValue`, junto a `singleFlight`, `rateLimiter` y `logger`.
