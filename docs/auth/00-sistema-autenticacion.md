# Sistema de autenticación — Referencia de punta a punta

**Última actualización:** 2026-07-31 · Este documento describe el sistema **como
está implementado**, de punta a punta: arquitectura, modelo de datos, flujos,
RBAC y propiedades de seguridad. Es la referencia única y autocontenida del
módulo de auth.

---

## 1. Visión general

Autenticación por **sesiones de doble token** sobre cookies `httpOnly`:

| Token | Forma | Vida (default) | Dónde vive | Propósito |
|---|---|---|---|---|
| **Access token** | JWT firmado (HS256) | 5 min | Cookie `__access_token` + se verifica por petición | Identidad ya verificada: evita tocar la DB en cada petición |
| **Refresh token** | Opaco (64 bytes aleatorios, hex) | 7 días | Cookie `__refresh_token`; en DB **solo su hash SHA-256** | Renovar el access token; representa la sesión persistida |

Principios:

- **El cliente nunca maneja tokens con JavaScript** — ambas cookies son
  `httpOnly`, firmadas (`COOKIE_SECRET`), `SameSite=Lax` y `Secure` en producción.
- **El estado de sesión vive en la DB**, no en el JWT. El refresh token no
  contiene datos; es una llave aleatoria cuyo hash identifica la fila de sesión.
- **Rotación en cada refresh** con idempotencia para peticiones concurrentes y
  **detección de robo por reuso** (OAuth 2.1).
- **Arquitectura hexagonal/screaming**: dominio y aplicación no importan
  React Router, Prisma ni Awilix; todo lo transversal es puerto + adaptador
  intercambiable. El sistema es una **plantilla** replicable en otros proyectos.

## 2. Estructura y responsabilidades

```
app/
├── core/                          ← adaptadores de arranque (atados al framework)
│   ├── env.server.ts              validación fail-fast del entorno (valibot)
│   ├── cookies.server.ts          cookies de tokens; maxAge derivado de los TTLs de env
│   └── db.server.ts               cliente Prisma singleton
├── modules/auth/
│   ├── domain/                    ← contratos puros, cero dependencias externas
│   │   ├── auth.service.ts        puerto AuthService (login/refresh/logout/logoutAll/verify)
│   │   ├── session-monitor.service.ts  puerto del monitor (listar/revocar/limpiar)
│   │   ├── token.service.ts       puerto TokenService (sign/verify JWT, generar/hashear refresh)
│   │   ├── password.service.ts    puerto IPasswordService (hash/compare)
│   │   ├── session.repository.ts  puerto SessionRepository (CRUD + rotateIfCurrent + cap + lectura admin)
│   │   ├── security-state.repository.ts  puerto SecurityStateRepository (epoch de validez, §6.6)
│   │   ├── security-state.rules.ts       evaluateToken(payload, snapshot) — decisión pura
│   │   ├── auth.config.ts         contrato AuthConfig (TTLs, límites, claims) + defaults del listado
│   │   ├── auth.errors.ts         errores de dominio tipados (con `code`)
│   │   ├── auth.rules.ts          esquemas valibot (sesión, payload JWT firmado y verificado, login, filtros)
│   │   └── auth.types.ts / auth.validators.ts / auth.mapper.ts
│   ├── application/               ← casos de uso e implementaciones de servicios
│   │   ├── auth.service.server.ts     orquesta login / refresh idempotente / logout
│   │   ├── session-monitor.service.server.ts  casos de uso del monitor (§6.5)
│   │   ├── token.service.server.ts    jose (JWT HS256) + node:crypto (refresh + SHA-256)
│   │   └── password.service.server.ts bcryptjs, 12 rounds
│   ├── infrastructure/
│   │   ├── session.repository.server.ts        adaptador Prisma del repositorio de sesiones
│   │   ├── security-state.repository.server.ts adaptador Prisma del estado de seguridad
│   │   └── security-state.cache.server.ts      decorador con caché (singleton de PROCESO)
│   ├── utils/                     ← copia de usuario y contratos de formulario
│   │   ├── auth-error-messages.ts             diccionario del login (opaco a propósito)
│   │   ├── session-monitor-error-messages.ts  diccionario del monitor (explícito)
│   │   └── session-monitor-form.ts            intents del action del monitor
│   └── routes/                    ← adaptadores de entrada (React Router)
│       ├── iniciar-sesion/        página + action (login) + loader (skip si ya autenticado)
│       ├── cerrar-sesion/         action: cierra LA sesión actual
│       ├── cerrar-sesiones/       action: cierra TODAS las sesiones del usuario
│       └── sesiones/              página SUPERADMIN: monitor de sesiones (§6.5)
├── shared/
│   ├── auth/require-auth.server.ts    guard de autenticación para loaders/actions
│   ├── auth/require-role.server.ts    guard de autorización por rol (único punto RBAC)
│   ├── concurrency/single-flight[.memory].ts   puerto + adaptador (refresh idempotente)
│   ├── rate-limit/rate-limiter[.memory].ts     puerto + adaptador (fuerza bruta)
│   ├── logging/logger[.console].ts             puerto + adaptador (con redacción)
│   ├── http/origin.ts                 defensa CSRF (verificación de Origin)
│   ├── http/client-ip.ts              extracción validada de la IP del cliente
│   ├── rules/atoms.rules.ts           atoms compartidos: email, password, newPassword, ROLES
│   └── di/container.server.ts / container.types.ts   contenedor Awilix por petición + singletons de proceso
└── root.tsx                       ← middleware global (CSRF → contenedor → cookies)
```

**Regla de dependencias:** `routes → application → domain ← infrastructure`.
El dominio no importa nada de fuera; la aplicación depende de puertos; los
adaptadores (rutas, Prisma, cookies, contenedor) dependen hacia adentro.

## 3. Modelo de datos

```prisma
User    { id, documentId(uuid, unique), email(unique), password(bcrypt|null),
          role, firstName?, lastName?, phone?, timestamps }

User    { ..., tokensValidAfter? }   // epoch de validez POR USUARIO (§6.6)

SecurityState { id(=1), tokensValidAfter,        // epoch de validez GLOBAL (§6.6)
                lockdownAt?, lockdownScope?,      // inertes: Fase B del lockdown
                lockdownReason?, lockdownBy?, updatedAt }

Session { id(uuid), userId(FK → User, cascade),
          refreshTokenHash(unique),   // SHA-256 hex del token vigente
          prevTokenHash?, rotatedAt?, // ventana de gracia de la rotación
          userAgent?, ipAddress?,     // metadatos informativos (auditoría)
          expiresAt, timestamps }
```

Invariantes:

- **Ningún token crudo se persiste.** Un volcado de `sessions` no permite
  fabricar cookies de sesión (el hash no es reversible y la entrada tiene 512
  bits de entropía — no necesita salt).
- `prevTokenHash` + `rotatedAt` sostienen la ventana de gracia y la detección
  de reuso (ver §6).
- `ipAddress` se valida en formato al capturarse pero es **solo informativa**:
  ninguna decisión de seguridad depende de ella.
- Sin denormalización: el usuario de una sesión se resuelve por la relación
  (`userRepository.findByInternalId(session.userId)`).

## 4. Configuración

Validada **al arrancar** en `core/env.server.ts` — si falta un secreto o está
malformado, el proceso lanza error con el detalle; la app nunca corre degradada.

| Variable | Default | Uso |
|---|---|---|
| `JWT_SECRET` | — (requerido, ≥32 chars) | Firma HS256 del access token |
| `COOKIE_SECRET` | — (requerido, ≥32 chars) | Firma de las cookies |
| `AUTH_ACCESS_TOKEN_TTL_S` | `300` (5 min) | Vida del JWT **y** `maxAge` de su cookie. Es también la **latencia máxima de una revocación** (§6.5) |
| `AUTH_REFRESH_TOKEN_TTL_S` | `604800` (7 días) | Vida de la sesión **y** `maxAge` de su cookie |
| `AUTH_REFRESH_GRACE_S` | `60` | Ventana de gracia del refresh (idempotencia + tolerancia a red) |
| `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE` | nombre de la app | Claims fijados al firmar y exigidos al verificar |
| `AUTH_LOGIN_MAX_PER_EMAIL` | `5` | Intentos de login por email por ventana |
| `AUTH_LOGIN_MAX_PER_IP` | `20` | Intentos de login por IP por ventana |
| `AUTH_LOGIN_WINDOW_S` | `60` | Ventana del rate limiter |
| `AUTH_MAX_SESSIONS_PER_USER` | `5` | Cap de sesiones activas; al exceder cae la más antigua |
| `AUTH_SECURITY_STATE_CACHE_TTL_S` | `5` | Caché del estado de seguridad. **Es** la ventana de propagación de una revocación entre nodos (§6.6) |

Los TTLs son la **única fuente de verdad**: tokens y cookies derivan de la misma
constante (`AuthConfig`, construido una vez por proceso e inyectado vía DI).

## 5. Ciclo de vida de una petición

Todo pasa por el middleware de `root.tsx`, en este orden:

```
Petición entrante
  │
  ├─ 0. ¿Método de escritura con Origin ajeno? → 403 (defensa CSRF, §8)
  │
  ├─ 1. configureContainer(request):
  │      · crea el contenedor DI de la petición
  │      · parsea las cookies firmadas
  │      · access token válido + posterior al epoch ─→ authPayload listo, sigue
  │      · access ausente/expirado/REVOCADO + refresh → SILENT REFRESH (§6)
  │           · éxito → nuevas cookies en apiContext.newCookies
  │           · fallo → limpia cookies + redirect a /iniciar-sesion
  │      · sin tokens ──────────────────────→ authPayload = null (anónimo)
  │
  ├─ 2. Corre el loader/action de la ruta
  │      · rutas protegidas: requireAuth / requireRole leen el authPayload
  │        YA verificado — nunca re-verifican cookies ni tocan la DB
  │
  └─ 3. Si hubo refresh, anexa los Set-Cookie a la respuesta
```

Claves del diseño:

- **La verificación ocurre una sola vez por petición**, en el middleware. Los
  loaders consumen el resultado (`context.authPayload`) a través de los guards.
- El payload del JWT es mínimo y se valida con esquema al decodificar:
  `{ sub: documentId, userId, email, role, iat }`. Un rol fuera del picklist
  compartido invalida el token completo, y **`iat` es obligatorio al verificar**:
  sin él no se puede contrastar contra el epoch, y un token inevaluable se
  rechaza en vez de dejarlo pasar sin comprobar.
- `verifyAccessToken` exige algoritmo (`HS256`), `issuer` y `audience` — un JWT
  firmado con otro alg o emitido por otra app/entorno se rechaza aunque
  compartiera secreto.
- **Firma válida no basta.** Tras verificarla, el middleware compara el token
  con el **epoch de validez** (§6.6): esa es la única lectura de estado del
  camino caliente, y viene de una caché de proceso, no de la base de datos. Un
  token revocado cae en la rama de silent refresh que ya existía.

## 6. Flujos

### 6.1 Login (`POST /iniciar-sesion`)

1. **Validación del DTO** (valibot): email normalizado (lowercase/trim);
   password no vacía y ≤ 72 chars (límite efectivo de bcrypt — evita procesar
   entradas gigantes y el matiz de autenticar por truncamiento).
2. **Rate limiting** (puerto `RateLimiter`): claves por email (límite estricto)
   y por IP (laxo — la IP es spoofable sin proxy de confianza, por eso nunca es
   el límite principal). Excedido → error `TOO_MANY_ATTEMPTS` con `retryAfter`.
3. **Verificación timing-safe**: se ejecuta `bcrypt.compare` SIEMPRE — si el
   email no existe, contra un hash dummy memoizado por proceso. Un email no
   registrado tarda lo mismo que uno registrado (no hay enumeración por timing)
   y ambos fallos responden el mismo error `INVALID_CREDENTIALS`.
4. **Creación de sesión**: refresh token aleatorio (64 bytes) → en DB solo su
   hash, junto con `userAgent`/`ipAddress` (validada, informativa) y `expiresAt`.
5. **Cap de sesiones**: se conservan las N más recientes del usuario
   (`deleteOldestExceeding`); la más antigua cae si se excede.
6. **Respuesta**: access token firmado + ambas cookies (`Set-Cookie`) +
   redirect a la zona autenticada.

Errores: solo los de dominio conocidos llegan al usuario con mensaje propio
(credenciales inválidas, demasiados intentos, validación); cualquier otro se
loguea a nivel `error` y responde un mensaje genérico — **nunca se filtran
detalles internos** (Prisma, stack traces).

### 6.2 Silent refresh (automático, en el middleware)

Cuando el access token expiró pero hay refresh token. Es **idempotente** para
peticiones concurrentes o rezagadas. Tres capas:

**Capa 1 — Single-flight con caché de resultado (memoria, por proceso).**
El hash del token entrante es la clave de idempotencia. N peticiones
concurrentes (pestañas, prefetch, batch) comparten UNA rotación; las rezagadas
dentro de la ventana de gracia reciben el resultado cacheado — el mismo par de
tokens. Resuelve el ~99 % de los casos.

**Capa 2 — Rotación compare-and-swap en DB.**
`UPDATE sessions SET hash = nuevo, prevTokenHash = viejo, rotatedAt = now()
WHERE id = ? AND refreshTokenHash = viejo` — un solo statement; la DB arbitra
la carrera entre procesos. Si el CAS pierde (`stale`), el caso de uso re-evalúa
una vez (el token caerá en la rama de gracia).

**Capa 3 — Gracia persistida + detección de reuso.** Tabla de decisión según
qué hash coincide:

| El hash entrante coincide con… | Acción |
|---|---|
| `refreshTokenHash` (vigente) | Rotación normal: nuevo par de tokens; el viejo pasa a `prevTokenHash` |
| `prevTokenHash`, dentro de la gracia | **Fallback degradado** (cliente rezagado tras reinicio/otro proceso): se emite solo un access token nuevo; su cookie de refresh no se toca y converge en el siguiente ciclo |
| `prevTokenHash`, fuera de la gracia | **Robo presunto** → se revocan TODAS las sesiones del usuario y falla con `TOKEN_REUSE` |
| Ninguno | `INVALID_SESSION` (token corrupto o sesión ya revocada) |

En cada rotación el access token se firma con **datos frescos del usuario**
(rol/email actuales desde la DB), así un cambio de rol se refleja a más tardar
al expirar el access token vigente.

Si el refresh falla por cualquier causa — incluidos errores de infraestructura
(DB caída) — el middleware degrada a "limpiar cookies + redirect a login":
nunca un crash sin controlar.

### 6.3 Logout (`POST /cerrar-sesion`)

Elimina la sesión de la DB (buscada por hash; idempotente si ya no existe) y
expira ambas cookies. Responde `303` con los `Set-Cookie` de limpieza para que
el navegador los aplique antes de seguir el redirect.

### 6.4 Logout global (`POST /cerrar-sesiones`)

Requiere autenticación; revoca **todas** las sesiones del usuario
(`logoutAll(userId)`) — el mismo caso de uso que dispara la detección de reuso
— y limpia cookies.

### 6.5 Monitor de sesiones (`/dashboard/sesiones`, solo SUPERADMIN)

Panel de administración sobre las sesiones de **terceros**. Vive en un servicio
propio (`SessionMonitorService`) y no en `AuthService`: aquel resuelve la sesión
de quien pide y parte de él corre en el middleware de cada petición; este solo
se alcanza tras un `requireRole(SESSION_MONITOR_ROLES)` (solo `SUPERADMIN`) en el loader **y** en el action.

**Listado.** Página global y filtrable de todas las sesiones de la plataforma.
Los filtros (búsqueda por nombre/correo del dueño, estado, orden, paginación)
viven en la URL, así que la vista es enlazable y sobrevive a un refresh. El
orden solo admite columnas de una allowlist (`SESSION_SORT_FIELDS`): el valor
llega del query string y termina en un `orderBy`.

Lo que se muestra es una proyección (`SessionSummary`), **no** la fila de
`sessions`: enumera los campos que salen en vez de omitir los que no, así que
`refreshTokenHash` y `prevTokenHash` no pueden filtrarse por descuido al añadir
una columna al modelo. El dueño se resuelve por la relación y deduplicado por
`userId` — la tabla sigue sin denormalizar nada (§3).

**Acciones**, todas idempotentes salvo donde se indica:

| Acción | Efecto | Latencia | Nota |
|---|---|---|---|
| Revocar una sesión | `deleteById` | ≤ `AUTH_ACCESS_TOKEN_TTL_S` | Falla con `SESSION_NOT_FOUND` si ya no existe: el panel distingue "revocada ahora" de "ya no estaba". Deshabilitada sobre la sesión propia — para esa está `/cerrar-sesion`, que además limpia cookies |
| Revocar las de un usuario | `deleteAllByUserId` + **epoch del usuario** | **inmediata** | El borrado mata la renovación; el epoch mata el acceso en curso |
| **Cerrar todas** | `deleteAllExcept(sesión actual)` + **epoch global** | **inmediata** | Contención ante un incidente. Preserva **una sola** sesión: la de quien ejecuta la acción, resuelta hasheando su refresh token. Se registra a nivel `warn` con el conteo — es la acción más destructiva del panel |
| Limpiar expiradas | `deleteExpired` | n/a | Higiene de datos, no seguridad: una sesión expirada ya se rechaza en el caso de uso. Devuelve el conteo |

El cierre global recibe el refresh token **crudo** (igual que `logout`) y es el
servicio quien lo hashea: el adaptador de entrada nunca manipula secretos. Si el
token no resuelve a una sesión, la operación falla con `INVALID_SESSION` en vez
de revocar — sin una sesión que preservar expulsaría también a quien la pidió.

### 6.6 Epoch de validez: por qué revocar sí corta el acceso en curso

> Referencia completa: [02-revocacion-inmediata-epoch.md](./02-revocacion-inmediata-epoch.md).

Borrar una fila de `sessions` mata la capacidad de **renovar**, no la petición
que ya lleva un JWT vigente en la cookie: el middleware confía en la firma y no
consulta `sessions` (§5). Por sí solo, eso deja una ventana de exactamente
`AUTH_ACCESS_TOKEN_TTL_S`.

Lo que la cierra es el **epoch de validez**: un instante persistido contra el
que se compara el `iat` del token. Si el token es anterior, no vale aunque su
firma sea correcta — *not-before* aplicado como política del verificador.

- **Global** (`auth.security_state`, fila única): mata todos los access tokens
  vivos de la plataforma.
- **Por usuario** (`auth.users.tokens_valid_after`): mata solo los de esa cuenta.

No hay epoch por sesión: un token no dice de qué sesión salió, y cortar una sola
al instante exigiría introspección por petición — la opción descartada por
invertir la decisión de §1. Por eso "revocar una sesión" sigue teniendo la
ventana del TTL y las otras dos acciones no.

**El coste del caso normal no cambia.** El estado se lee de una caché de proceso
(`AUTH_SECURITY_STATE_CACHE_TTL_S`, 5 s), no de la base de datos, y la consulta
de epochs de usuario va acotada al horizonte del TTL del access token —
típicamente cero filas, porque pasado ese tiempo los tokens que podría invalidar
ya expiraron solos. Ese TTL **es** la ventana de propagación entre nodos.

**Si el store no responde, no se abre.** Con caché caliente se sirve el último
valor conocido; en frío se **deniega**. Un fallback a "sin revocaciones"
convertiría una caída de la base en la apertura automática de la plataforma.

Además existe el **lockdown**: subir el epoch por sí solo mata lo emitido,
pero un refresh token válido —o un login con contraseña— volvería a entrar un
segundo después. El lockdown bloquea también esos dos caminos mientras dure
un cierre — ver [03-lockdown.md](./03-lockdown.md).

El monitor usa un diccionario de copia **propio** y no el del login. Aquel
responde lo mismo a todos los fallos porque su consumidor es el formulario de
entrada y distinguir causas allí lo convierte en un oráculo para enumerar
cuentas (§8); aquí quien lee ya está autenticado y esa opacidad no protegería
nada.

## 7. Autorización (RBAC)

> La aplicación de estos guards en el árbol de rutas (gate estructural por
> `layout()`, boundaries, navegación por rol) se documenta en
> [routing/00-sistema-enrutado.md](../routing/00-sistema-enrutado.md).

- Los roles disponibles viven en **un único lugar**: la tupla `ROLES` en
  `shared/rules/atoms.rules.ts`, junto al predicado `hasRole(role, allowed)` que
  comparten servidor y cliente. El picklist derivado tipa el payload del JWT,
  las reglas de usuario y los guards — un proyecto derivado de la plantilla
  edita sus roles solo ahí. **No hay jerarquía de roles** y es deliberado: ver
  [routing §5.1](../routing/00-sistema-enrutado.md).
- **`requireAuth(request, context)`** — lanza redirect a login si no hay
  payload; devuelve `AuthContext` (`userId`, `documentId`, `email`, `role`).
- **`requireRole(request, context, roles, opts?)`** — único punto de decisión
  por rol; los loaders/actions **nunca** comparan strings de rol inline.
  Autenticado sin el rol → **403** (`statusText: "Forbidden"`, con el código
  `FORBIDDEN_ROLE`), que renderiza el ErrorBoundary de la zona. Un 403 conserva
  la URL intentada y no miente sobre lo ocurrido; `opts.redirectTo` queda como
  escotilla **opt-in** para flujos que prefieran reencaminar.
- Un JWT cuyo `role` no esté en el picklist es rechazado por el esquema al
  verificar — no existe "rol arbitrario válido".

## 8. Propiedades de seguridad (amenaza → defensa)

| Amenaza | Defensa |
|---|---|
| Robo de cookies por XSS | `httpOnly` (JS nunca ve los tokens) + cookies firmadas |
| CSRF | `SameSite=Lax` + verificación de `Origin` en el middleware para métodos de escritura (`shared/http/origin.ts`) + verificación nativa de React Router para actions |
| Volcado de la tabla de sesiones | Solo hashes SHA-256 en reposo; irreversibles |
| Robo del refresh token (cookie) | Rotación en cada uso + reuso fuera de gracia revoca la familia completa de sesiones |
| Fuerza bruta de contraseñas | Rate limit por email (estricto) y por IP (laxo) + bcrypt cost 12 |
| Enumeración de usuarios | Mismo mensaje y misma latencia (dummy compare) exista o no el email |
| JWT forjado / confusión de algoritmo | Secreto ≥32 chars validado al arrancar; `algorithms`, `issuer` y `audience` fijados |
| Secretos ausentes en producción | Fail-fast al arrancar (la app no corre) |
| DoS por payloads de login gigantes | `maxLength(72)` en el DTO antes de tocar bcrypt |
| Crecimiento sin cota de sesiones | Cap por usuario (default 5, configurable) |
| Logs filtrando credenciales | Puerto `Logger` con redacción automática de claves sensibles (token/cookie/password/secret/authorization) |
| Escalada por token con rol viejo | El refresh re-lee rol/email de la DB al rotar |
| Sesión comprometida detectada a mano | Monitor de sesiones (§6.5): revocación puntual, por usuario o global preservando la propia — contención sin tocar la base de datos |
| Cuenta comprometida siguiendo activa tras revocarla | **Epoch de validez** (§6.6): revocar por usuario o cerrar todas invalida los access tokens ya emitidos, no solo la renovación. Latencia ≤ `AUTH_SECURITY_STATE_CACHE_TTL_S` en vez de ≤ `AUTH_ACCESS_TOKEN_TTL_S` |
| Base de datos caída abriendo el acceso por error | La caché del estado sirve el último valor conocido; en frío **deniega**. Nunca hay fallback a "sin revocaciones" |
| Desfase de reloj entre nodos moviendo el epoch | Las escrituras usan `now()` de Postgres, nunca la hora del proceso |
| Fuga de hashes por la pantalla de administración | El monitor proyecta `SessionSummary`, que enumera los campos expuestos; los hashes no forman parte del contrato |
| Cuenta(s) comprometida(s) durante un incidente activo y no solo revocada(s) | **Lockdown** ([03-lockdown.md](./03-lockdown.md)): bloquea además `login` y `refresh` mientras dure el cierre, con alcance `all` o `except-admin`; el epoch por sí solo mata lo emitido pero no impide volver a entrar |

**Límites conocidos (aceptados y documentados):**

- La IP (`X-Forwarded-For`) es falsificable sin un proxy de confianza delante;
  por eso el rate limit por IP es secundario y la IP nunca decide seguridad.
  Se endurece en despliegue (Cloudflare/nginx sobrescribiendo el header).
- Single-flight y rate limiter son **en memoria (un proceso)**. Con varios
  nodos, las capas de DB mantienen la corrección (CAS + gracia persistida) y
  los puertos se reimplementan sobre Redis sin tocar dominio.

## 9. Manejo de errores y observabilidad

- **Errores de dominio tipados** (`auth.errors.ts`), todos con `code`:
  `INVALID_CREDENTIALS`, `INVALID_SESSION`, `SESSION_EXPIRED`, `TOKEN_REUSE`,
  `TOO_MANY_ATTEMPTS` (con `retryAfterMs`). Los casos de uso lanzan solo estos.
- **En el borde** (actions): errores conocidos → mensaje de usuario; errores de
  validación → mensaje del esquema; todo lo demás → log a nivel `error` +
  mensaje genérico.
- **Logger** (puerto en `shared/logging/`): niveles, `child(bindings)` y
  redacción de claves sensibles; `debug` solo fuera de producción. El evento de
  **reuso de token** se registra a nivel `warn` con el `userId` — es la señal
  de auditoría de un posible robo.

## 10. Cómo replicarlo en otro proyecto (plantilla)

Qué se lleva tal cual (agnóstico): todo `modules/auth/domain`,
`modules/auth/application`, y los puertos/helpers de `shared/`
(single-flight, rate-limiter, logger, origin, client-ip, atoms).

Qué se reescribe por stack (adaptadores):

1. **Entrada**: las rutas/controllers (aquí React Router) — login/logout son
   ~40 líneas cada uno sobre el `AuthService`.
2. **Persistencia**: `session.repository.server.ts` (aquí Prisma) — la única
   pieza no trivial es `rotateIfCurrent` como update condicional atómico.
3. **Cookies/transporte**: `core/cookies.server.ts` — o headers `Authorization`
   si el cliente no es navegador (el dominio no cambia).
4. **Arranque**: validación de env y el cableado del contenedor (aquí Awilix;
   sirve cualquier DI o construcción manual). Ojo: single-flight, rate limiter
   y logger deben ser **singletons de proceso**, no por petición.

Puntos de variación previstos por proyecto: tupla `ROLES`, TTLs/límites por
env, política de contraseñas (`atoms.newPassword`), y los adaptadores de
memoria → Redis al escalar horizontalmente.

## 11. Pendientes conocidos

Por planear en sesión aparte:

- **Limpieza automatizada de expiradas:** ya existe un disparador **manual** en
  el monitor (§6.5), pero nada la ejecuta sola. Opciones evaluadas en el plan:
  oportunista / scheduler / pg_cron. Nota: es higiene de datos, no seguridad —
  las sesiones expiradas ya se rechazan en el caso de uso.
- **Desalojo del cap por uso reciente:** `deleteOldestExceeding` ordena por
  `createdAt`, así que el cap es por antigüedad absoluta. Una sesión vieja pero
  activa puede caer antes que una nueva y ociosa. Si se quiere LRU, el cambio es
  ordenar por `updatedAt` en ese único `findMany`.
- **Auditoría persistida:** las revocaciones del monitor y del lockdown se
  registran en el log (`warn`), pero no hay tabla de eventos de auditoría
  separada de los logs técnicos (docs/reglas.md §13.4). Este trabajo
  (revocación + lockdown) es lo que más la justificaría — sigue siendo un
  pendiente general del proyecto.
