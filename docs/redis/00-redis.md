# Redis — Referencia de punta a punta

**Última actualización:** 2026-10-05 · Este documento describe el uso de Redis
**como está implementado**. La decisión y lo que se descartó están en
[ADR 0032](../adr/0032-redis-opcional-cache-y-coordinacion.md).

---

## 1. Qué es y qué no es

Redis coordina varios procesos de la app y guarda copias de lectura con TTL.
**Nada de lo que guarda es dato de negocio**: Postgres sigue siendo la única
fuente de verdad y todo lo que hay en Redis se reconstruye solo.

Es **opcional**. Sin `REDIS_URL`, cada pieza usa su adaptador de proceso, el mismo
que existía antes, y la app funciona igual en un solo nodo. Ningún fallo de Redis
tumba una petición ni abre un acceso que debía negarse.

| Pieza | Con Redis | Sin Redis | Si Redis cae |
|---|---|---|---|
| Rate limiter | Ventana deslizante compartida entre nodos | Ventana fija por proceso | Responde el limitador del proceso (§3.3) |
| Corte de sesión | Los demás nodos releen el estado en ≈1 RTT | Cada nodo relee al vencer su TTL (5 s) | Vuelve a ≤ TTL; al reconectar, relee |
| URLs firmadas | La misma URL entre nodos y cargas | La misma URL dentro del proceso | Se firma directo |
| Resumen de créditos | Se sirve de caché hasta que cambia | Se calcula siempre | Se calcula siempre |

## 2. Conexión

`app/shared/redis/redis.client.server.ts` abre **dos conexiones por proceso** con
ioredis 5:

| Conexión | Para qué | Opciones clave |
|---|---|---|
| `command` | Todos los comandos | `enableOfflineQueue: false`, `commandTimeout: 250 ms`, `maxRetriesPerRequest: 1` |
| `subscriber` | Solo pub/sub (una conexión suscrita no admite otros comandos) | Con cola offline: la suscripción se pide antes de `ready` |

- **Falla rápido.** Desconectado, un comando se rechaza al instante y su llamador
  toma el camino sin Redis. Esperar a que vuelva costaría más que no usarlo.
- **Reintenta siempre.** `reconnectDelayMs` (`redis.retry.ts`) usa un backoff
  exponencial de 100 ms a 5 s, con la mitad aleatoria para que los nodos no
  reconecten a la vez. Nunca devuelve `null`, así que ioredis nunca deja de
  reintentar.
- **Sin listener de `error`, ioredis tumba el proceso.** Las dos conexiones lo
  tienen, y el aviso pasa por `createThrottledLog`: una línea cada 10 s por
  conexión, con el número de avisos callados.
- **`family: 0`.** La red privada de Railway resuelve por IPv6.
- **Recarga en caliente.** Las conexiones se guardan en `globalThis`, como el
  cliente de Prisma, para no abrir sockets nuevos en cada recarga.
- **Composición.** Las conexiones no se registran en el cradle. Solo las usan las
  factories del contenedor; ningún servicio habla con Redis.

## 3. Rate limiter distribuido

Archivos: `app/shared/rate-limit/`. El puerto `RateLimiter` pasó a ser asíncrono
(`consume(): Promise<RateLimitDecision>`) y **promete no lanzar**.

### 3.1 El script

`rate-limiter.sliding-window.lua.ts` es atómico y se ejecuta en un solo viaje con
`EVALSHA`. Opera sobre un ZSET de marcas de tiempo:

1. Toma la hora de Redis (`TIME`), no la del proceso. Así, un reloj desfasado entre
   nodos no estira ni acorta la ventana. Es el mismo criterio que `now()` de
   Postgres en el epoch ([auth/02 §7.2](../auth/02-revocacion-inmediata-epoch.md)).
2. Borra lo que quedó fuera de la ventana y cuenta lo que queda.
3. Si hay cupo, agrega el intento (con un nonce, para que dos en el mismo
   milisegundo cuenten por separado) y renueva el `PEXPIRE`.
4. Si no hay cupo, responde cuánto falta para que salga el intento más viejo.
   **Un rechazo no se registra**: el ZSET nunca pasa de `limit` miembros y todo
   bloqueo termina.

### 3.2 Límites vigentes

| Límite | Clave lógica | Cupo | Dónde |
|---|---|---|---|
| Login por email | `auth:login:email:<email>` | `AUTH_LOGIN_MAX_PER_EMAIL` / `AUTH_LOGIN_WINDOW_S` | `auth.service.server.ts` |
| Login por IP | `auth:login:ip:<ip>` | `AUTH_LOGIN_MAX_PER_IP` / `AUTH_LOGIN_WINDOW_S` | ídem |
| Asistencia por QR | `check-in:<ip>` | 20 / min | loader y action de `/asistencia/:token` |
| Inscripción por QR | `enrollment-qr:<ip>` | 20 / min | loader de `/inscripcion/:token` |
| Verificación de certificado | `certificate-verify:<ip>` | 30 / min | loader de `/verificar/:documentId` |
| **Cambios propios de inscripción** | `enrollment-intent:<userId>:<curso>` | 10 / 10 min | `enroll`, `withdraw`, `accept` y `decline` de `enrollments.service.server.ts` |
| **Envío de cuestionarios** | `quiz-submit:<userId>:<curso>` | 10 / min | `submit` de `quiz.service.server.ts` |

Las claves lógicas salen de funciones puras en el `<modulo>.config.ts` de cada
módulo (`loginEmailRateKeyOf`, `checkInRateKeyOf`…). En Redis se guardan como
`rl:v1:<dominio>:<sha256>`: el email o la IP nunca quedan en claro.

Los dos límites nuevos protegen recursos compartidos:

- **Inscribirse** bloquea la fila del curso y encola un correo. Alternar entre
  inscribirse y darse de baja llenaría la cola de avisos.
- **Enviar un cuestionario** bloquea la fila del curso, y los intentos pueden ser
  ilimitados. Sin freno, una sola persona haría esperar a todo el curso.

Las acciones administrativas (asignar, invitar, dar de baja a otro) no llevan
límite.

### 3.3 Modo de fallo

`createFallbackRateLimiter` envuelve al de Redis. Si este lanza, decide una
instancia en memoria que vive todo el proceso, y queda un `warn` con throttle.
Mientras dure la caída:

- cada nodo cuenta por su cuenta, así que el límite efectivo es límite × nodos;
- los contadores empiezan de cero.

El login nunca se queda sin freno: el límite por email y bcrypt siguen
protegiéndolo ([auth/00 §8](../auth/00-sistema-autenticacion.md)). Cada intento
vuelve a probar Redis, así que la recuperación es automática.

## 4. Corte de sesión instantáneo entre nodos

Archivos:

- `app/shared/cache/invalidation-bus*.ts`
- `app/modules/auth/infrastructure/security-state.cache.server.ts`

La caché del estado de seguridad sigue siendo **por proceso**, con su TTL y su modo
de fallo intactos. Lo nuevo es el puerto `InvalidationBus`:

- Toda escritura (revocar, revocar a un usuario, lockdown, levantarlo) invalida la
  caché local y publica en `security-state:invalidate`.
- Cada nodo está suscrito y, al recibir el aviso, ejecuta `expire()`: relee en la
  siguiente petición, pero **conserva el último valor conocido** como respaldo. Si
  la base cae justo después, el corte que ya se conocía sigue en pie.
- La escritura propia, en cambio, deja la caché en frío (`cached = null`). El estado
  de antes del corte no puede servir de respaldo del de después.
- **Un contador de generación** impide que una lectura que empezó antes del aviso
  deje cacheado el estado viejo. Responde a quien la esperaba, pero no fija el TTL.
- **Al reconectar** la conexión suscrita, todos los handlers se ejecutan, porque
  durante la caída pudo perderse un aviso.
- **Recarga en caliente.** Los handlers viven en un registro global atado a la
  conexión, así que una recarga reemplaza el handler en vez de sumar otro.

El aviso no transporta datos: perderlo nunca da un estado equivocado, solo uno que
tarda lo que dure el TTL. El canal lleva el prefijo del entorno
(`<prefijo>inv:v1:<canal>`), porque ioredis no aplica `keyPrefix` a los canales.

| Situación | Propagación del corte a los demás nodos |
|---|---|
| Con Redis | ≈ 1 RTT (medido: < 300 ms, con un TTL de 300 s en el nodo receptor) |
| Sin Redis o con Redis caído | ≤ `AUTH_SECURITY_STATE_CACHE_TTL_S` (5 s) |

## 5. Caché de URLs firmadas

Archivos:

- `app/shared/storage/url-signer*.ts`
- `app/shared/storage/signed-url*.ts`

El objetivo es que el mismo archivo tenga **la misma URL** mientras viva su firma.
Así el navegador reutiliza el video o el PDF de su caché en lugar de descargarlo de
nuevo en cada carga. Funciona porque la key de un objeto nunca cambia de contenido
(`object-key.ts` le pone marca de tiempo).

- `urlSigner.signMany(requests)` hace un solo `MGET` para todo el lote. Firma solo
  lo que falta o lo que ya no tiene margen, y escribe en un pipeline de `SET PX`.
- La política (`SignedUrlPolicy`) dice cuánto vive la firma y cuánto le tiene que
  quedar al entregarse. El material de lección usa `LESSON_PLAYBACK_URL_POLICY`:
  firma de 6 h, se reutiliza hasta 2 h y siempre se entrega con 4 h por delante,
  para que nadie se quede sin firma a mitad de un video largo.
- `lessonMaterialReader.signReferences` y el material de sesiones firman **todo lo
  que pinta la vista en un solo lote**. El tablero de una capacitación con muchas
  sesiones no paga un viaje a la caché por archivo. Lo bloqueado no se firma.
- Clave `su:v1:<sha256(bucket, key, disposición, vida)>`. Un valor ilegible cuenta
  como ausente.
- Sin Redis, la caché es un LRU de 5,000 entradas en el proceso. Varios nodos dan
  URLs distintas para el mismo objeto, pero todas son válidas.

**No se cachean:**

| Firma | Motivo |
|---|---|
| Proxy `/api/storage` (5 min) | El navegador ya guarda la redirección 240 s. Cachearla acortaría esa vida y sumaría un viaje; alargar la firma para que valiera la pena dejaría vivo más tiempo un enlace privado filtrado. |
| URLs de subida | Son de un solo uso. |
| Gestor de nube (descarga y ZIP) | Acciones de administración puntuales: el navegador no gana nada. |

## 6. Caché versionada de agregados

Archivos:

- `app/shared/cache/versioned-cache*.ts`
- `app/core/after-commit.server.ts`
- los decoradores `*.repository.cache.server.ts` de `credits` y `dependencies`

Es el patrón `dash:stats` de ClassroomIO, aplicado a la vista más cara medida: el
**resumen de créditos por dependencia** de `/dashboard/creditos`. Son dos
consultas en serie sobre todo el ejercicio.

### 6.1 El patrón

- **Lectura:** un `MGET` con las versiones de los alcances de los que depende
  (`credits`, `dependencies`) y el valor. Es acierto solo si el valor se calculó con
  esas mismas versiones y cumple su esquema de valibot.
- **Fallo:** se calcula con las versiones leídas **antes** de consultar y se escribe
  `{v, d}` con `SET … EX 300`. Si otra petición invalida mientras tanto, lo escrito
  queda con una versión vieja y la siguiente lectura lo descarta. Un cache-aside
  simple guardaría el dato viejo durante todo el TTL.
- **Invalidar:** `SET ver:<alcance> <uuid>`. Un token aleatorio en vez de `INCR`
  evita que un contador expulsado por memoria vuelva a un valor ya usado.
- **Versión ausente:** se inicializa con `SET NX` antes de escribir. Nunca se guarda
  un valor contra una versión vacía, porque si la versión desapareciera ese valor
  volvería a parecer vigente.

### 6.2 Quién invalida, y cuándo

| Alcance | Escrituras que lo invalidan |
|---|---|
| `credits` | `grant`, `restore` y `revoke` del repositorio de créditos, solo con lotes no vacíos |
| `dependencies` | `create`, `update`, `archive` y `unarchive` del repositorio de dependencias |

Mover a una persona de dependencia **no** cambia el resumen: agrupa por la
dependencia guardada en cada crédito.

La invalidación corre **después del commit**, mediante `afterCommit`. Las
escrituras de créditos ocurren dentro de las transacciones de `teaching` y de
`progress-sync`:

- invalidar antes del commit dejaría que otra petición volviera a cachear el dato
  viejo;
- en un rollback no hace falta invalidar.

`runInTransaction` encola en la transacción más externa; fuera de una, la tarea
corre en el momento. `credits.service.server.ts` y `completion-sync.server.ts` no
cambiaron: el decorador se arma en el contenedor.

### 6.3 Sin Redis, no se cachea

El adaptador sin Redis es `passthrough`. Una copia por proceso no se enteraría de
lo que invalida otro nodo y serviría datos viejos durante todo el TTL.

### 6.4 Medición (servidor recién arrancado, Neon remoto)

Solo el loader de créditos (`?_routes=modules/credits/routes/creditos/index`),
como superadministrador:

| | Consultas | Base (ms) | Petición (ms) |
|---|---:|---:|---:|
| Antes | 2 en serie | ~157 | ~160 |
| Con Redis, fallo | 2 en serie | ~161 | ~183 |
| Con Redis, acierto | 0 | 0 | ~3 |
| Redis caído | 2 en serie | — | ~178 |

El `.data` completo de la ruta es idéntico antes y después, ignorando las marcas
de tiempo.

**Se descartó cachear las estadísticas de capacitadores.** Ya son una sola fase de
dos consultas indexadas, y su invalidación tendría demasiadas fuentes: valoración,
asignación, finalizar el curso y borrarlo (docs/reglas.md §26.5).

## 7. Claves

Todas pasan por `app/shared/redis/redis.keys.server.ts`; ningún servicio arma una a
mano. ioredis antepone `REDIS_KEY_PREFIX` (por defecto `idc:`).

| Clave | Tipo | TTL | Pieza |
|---|---|---|---|
| `rl:v1:<dominio>:<sha256>` | ZSET | La ventana | Rate limiter |
| `su:v1:<sha256>` | String (JSON) | Vida de la firma − margen | URLs firmadas |
| `vc:v1:ver:<alcance>` | String | Ninguno | Caché versionada |
| `vc:v1:val:<lectura>:<sha256>` | String (JSON) | 300 s | Caché versionada |
| `inv:v1:<canal>` (canal, no clave) | Pub/sub | — | Corte de sesión |

Cambiar la forma de un valor es subir su `v1`: las claves viejas mueren solas.

## 8. Operación

### Desarrollo

```bash
docker compose up -d redis          # redis:7-alpine, sin persistencia, 64 MB, allkeys-lru
REDIS_URL="redis://localhost:6379"  # en .env
```

### Railway (o una VPS en red privada)

1. Crear el servicio Redis y apuntar `REDIS_URL` a su URL **privada** por referencia
   de variable. Nunca a la pública.
2. Política de memoria: `maxmemory` en torno al 75 % del plan, con
   `--maxmemory-policy allkeys-lru` y sin persistencia (`--save "" --appendonly no`).
   - Expulsar cualquier clave solo provoca un fallo de caché o reinicia un contador.
   - `noeviction`, que es el default sin límite, haría fallar las escrituras al
     llenarse.
   - Nunca se encolan trabajos en Redis, así que no hay nada que no se pueda perder.
3. Desplegar con una réplica, comprobar `redis ready` en el log y luego escalar.
4. En una VPS es la misma configuración, con Redis escuchando solo en la red
   privada.

`REDIS_URL` lleva la contraseña: nunca va al log, a un ticket ni a un commit.

### Diagnóstico

```bash
redis-cli --scan --pattern 'idc:*'                        # qué hay
redis-cli PUBSUB NUMSUB idc:inv:v1:security-state:invalidate  # nodos suscritos
redis-cli INFO commandstats                               # carga por comando
```

## 9. Pruebas

- Los adaptadores se prueban contra `ioredis-mock`, que ejecuta Lua y pub/sub sin
  red. Las caídas se simulan reemplazando el comando por uno que rechaza.
- `rate-limiter.contract.ts` es el contrato que cumplen el limitador en memoria y el
  de Redis.
- Con `REDIS_TEST_URL=redis://localhost:6379`, el contrato corre también contra un
  Redis real. Sin esa variable se omite y la suite sigue sin red.
- `redis.client.server.ts` queda fuera del cómputo de cobertura, como los
  adaptadores de storage.

## 10. Lo que no se hace

Ver [ADR 0032 §3](../adr/0032-redis-opcional-cache-y-coordinacion.md):

- no hay cola de trabajos (BullMQ);
- no hay single-flight distribuido;
- no hay sesiones en Redis;
- no se cachean PDFs de certificados.
