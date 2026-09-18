# Lockdown — referencia de lo implementado (Fase B)

**Última actualización:** 2026-07-31 · **Estado: implementado.**

Complementa a [02-revocacion-inmediata-epoch.md](./02-revocacion-inmediata-epoch.md)
(Fase A: revocar mata lo ya emitido). Este documento describe el **lockdown**
tal como quedó construido: la segunda mitad que impide emitir más acceso
mientras dure el cierre.

## 1. Semántica

La regla que gobierna todo lo demás: **se bloquea todo lo que otorga o
prolonga acceso; se permite todo lo que lo reduce o lo observa.**

| Camino | Con lockdown | Por qué |
|---|---|---|
| Petición con access token válido | Bloqueada (salvo rol exento) | El epoch ya lo invalidó; el lockdown además impide colarse por rol |
| Silent refresh | Bloqueado | Un refresh vivo no debe acuñar un token nuevo durante el cierre |
| Login nuevo | Bloqueado | Nadie debe volver a entrar con contraseña durante el cierre |
| Logout | Permitido | Reduce superficie |
| Rutas públicas / estáticos / health | Permitidos | El cierre es de la zona autenticada |
| Levantar el cierre | Según alcance | Con `all`, solo por CLI (el panel también queda bloqueado) |

El lockdown tiene **precedencia** sobre los epochs en `evaluateToken`: gana
aunque el `iat` del token sea posterior a cualquiera de ellos
(`security-state.rules.ts`).

## 2. Alcances

- **`all`** — nadie exento, ni siquiera SUPERADMIN. Se usa cuando se sospecha que
  una cuenta administrativa está comprometida: exceptuar un rol es exceptuar
  el que podría ser el problema. Consecuencia directa: **el panel de
  administración queda inalcanzable**, así que solo se puede levantar con
  `bun run lockdown lift` (§5).
- **`except-admin`** — SUPERADMIN sigue operando (login, refresh, acceso en
  curso). Es el alcance operable desde el panel: permite investigar y
  levantar el cierre sin salir de la aplicación.

## 3. Las tres escrituras atómicas

`SecurityStateRepository.lockdown()` hace, dentro de una única
`prisma.$transaction`:

1. `tokens_valid_after = now()` — mata los access tokens vivos (el mismo
   epoch global de la Fase A).
2. **Purga de sesiones** — mata la capacidad de renovar.
   - `all` → se purgan todas.
   - `except-admin` → se purgan todas salvo las de usuarios `SUPERADMIN`. Purgar
     también las de SUPERADMIN expulsaría al operador y haría el alcance inútil:
     sus access tokens igual mueren por el epoch global, pero su sesión
     sobrevive y el silent refresh la recupera.
3. `lockdown_at` + `scope`/`reason`/`by` — bloquea `login` y `refresh`.

Fuera de una transacción hay ventanas reales en cualquier orden: escribir el
flag antes de purgar deja un instante en que se puede refrescar; purgar antes
del flag deja un instante en que se puede volver a entrar con contraseña.

**Se purga, no se pausa.** El lockdown se activa porque no se sabe qué está
comprometido; "solo pausar" apostaría a que los refresh tokens vivos son de
confianza, que es exactamente lo que no se puede afirmar durante un
incidente.

`lift()` solo pone `lockdown_at = NULL` (con su scope/reason/by). **No**
revierte `tokens_valid_after`: lo emitido antes del cierre sigue sin ser
válido después de levantarlo, y eso es correcto — levantar el lockdown
restaura la posibilidad de operar, no perdona lo que ya se invalidó.

## 4. Dónde corta cada camino

- **Login** (`auth.service.server.ts`, `performLogin`):
  - `all` — antes del rate limiter y de `bcrypt.compare`: durante un
    incidente no interesa gastar CPU verificando contraseñas que se
    rechazarán igual.
  - `except-admin` — no se puede saber el rol antes de resolver el usuario,
    así que el corte va después de `findByEmail` + `compare` y antes de
    emitir tokens. El coste extra solo se paga en ese alcance, y el camino es
    indistinguible en timing del de credenciales inválidas.
- **Refresh** (`auth.service.server.ts`, `refresh`/`rotate`): lanza
  `PlatformLockedError` en vez de devolver un envelope, igual que el resto de
  errores de refresh — su consumidor es el middleware
  (`container.server.ts`), que ya degrada a "limpiar cookies + redirect".
  - `all` — al principio de `refresh`, antes del single-flight: ni siquiera
    se cachea el intento.
  - `except-admin` — dentro de `rotate`, en las dos ramas que resuelven el
    usuario (rotación normal y ventana de gracia), tras `findByInternalId`.
- **Acceso en curso** (middleware, sin cambios): `evaluateToken` ya
  comprueba el lockdown con precedencia sobre los epochs (§1); el middleware
  no necesitó tocarse — es el dividendo de que la decisión viviera en una
  función pura desde la Fase A.

## 5. Break-glass — `scripts/lockdown.ts`

Requisito de la funcionalidad, no un extra: con alcance `all` la aplicación
no puede levantarse a sí misma, porque el middleware bloquea toda petición
autenticada, incluida la que levantaría el cierre desde el panel.

```
bun run lockdown status
bun run lockdown activate --scope=all --reason="..."
bun run lockdown lift
```

Sin HTTP, sin sesión, sin caché — importa Prisma directamente, mismo
precedente que `prisma/seed.ts`. Imprime el estado resultante y sale con
código ≠ 0 si algo falla.

**Debe probarse en staging antes de necesitarse.** Un break-glass que se
estrena durante el incidente es un segundo incidente.

## 6. Qué ve quien queda bloqueado

Copia genérica en el login/refresh (`auth-error-messages.ts`):
`"El acceso está temporalmente suspendido. Inténtalo más tarde."` — no dice
"incidente de seguridad", no da plazo. `lockdownReason` **nunca** viaja al
cliente: es contexto para quien opera, no para quien queda fuera.

En el panel de administración (`session-monitor-error-messages.ts`) el
mismo código sí tiene copia explícita: el público ya es un administrador
autenticado, y esa opacidad no protegería nada ahí.

## 7. UI

- **Banner global** (`dashboard.layout.tsx`): el loader del layout lee el
  estado de seguridad (lectura cacheada, coste ~0) y pinta una franja
  persistente si hay lockdown activo. Solo lo ven los roles exentos — los
  demás ni siquiera llegan a renderizar el layout.
- **Diálogo en `/dashboard/sesiones`** (`components/lockdown-dialog.tsx`): se
  abre desde el botón «Lockdown…» de la cabecera, que solo existe sin
  lockdown activo. Pide alcance (cada opción con su consecuencia), motivo
  opcional y la palabra `CERRAR` (`LOCKDOWN_CONFIRMATION_WORD`, la misma
  constante que valida `lockdownRule`); el botón queda deshabilitado hasta
  que coincide. El resto del monitor confirma con `ConfirmDialog`.
- **Con lockdown activo** la pantalla no repite fecha ni alcance (ya están en
  el banner): muestra un aviso con «Levantar lockdown» si el alcance es
  `except-admin`, o el comando de CLI literal si es `all`.

## 8. Auditoría

`lockdown` y `lift` (`security-state.service.server.ts`) loguean a `warn` con
quién, alcance y sesiones purgadas — es la acción más destructiva del
sistema y la que explica cualquier anomalía posterior. No hay tabla de
auditoría append-only separada de los logs técnicos; sigue siendo un
pendiente general del proyecto (docs/reglas.md §13.4).

## 9. Runbook de rotación de secretos posterior

El lockdown mata sesiones y tokens vivos, pero no rota `JWT_SECRET` ni
credenciales de base de datos. Si el incidente involucró exposición de
secretos, tras levantar el cierre:

1. Rotar `JWT_SECRET` (invalida TODOS los access tokens firmados con el
   anterior, incluidos los que sobrevivieron por estar fuera de cualquier
   epoch).
2. Rotar credenciales de base de datos si se sospecha acceso directo.
3. Revisar logs de `warn`/`error` del periodo del incidente para reconstruir
   el alcance real.

Es infraestructura, no aplicación: se ejecuta manualmente y después del
cierre, no lo automatiza este módulo.

## 10. Qué no resuelve

- **Peticiones en vuelo** al momento de activar el cierre: ya se aceptaron
  antes de leer el nuevo estado.
- **Lo ya hecho** con el acceso previo a la revocación: el lockdown corta
  acceso futuro, no deshace acciones pasadas.
- **Un atacante con acceso directo a la base de datos o al despliegue**:
  puede leer/escribir el propio flag de lockdown. Este mecanismo asume que el
  compromiso es de credenciales de aplicación, no de la infraestructura que
  la aloja.
- **Introspección por sesión** y **multi-tenancy**: fuera de alcance — la
  primera invertiría la decisión de no consultar la base de datos por
  petición (§2 de [02](./02-revocacion-inmediata-epoch.md)); la segunda es una
  decisión a tomar el día que se aborde multi-tenancy.
