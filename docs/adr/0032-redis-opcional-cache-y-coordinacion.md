# ADR 0032 · Redis opcional: coordinación entre nodos y cachés de lectura

**Estado:** aceptado · 2026-10-05 · §2.4 y la fila "BullMQ para el correo" de §3
reemplazadas por [ADR 0033](./0033-colas-bullmq-sobre-el-outbox.md) (2026-10-06)

## 1. Contexto

La app corre como un solo proceso en Railway y está prevista para escalar a
varias réplicas, o para moverse a una VPS en red privada. Tres piezas eran por
proceso por diseño, y su documentación ya anticipaba "Redis al escalar":

- el rate limiter, en memoria;
- el single-flight del refresh;
- la caché del estado de seguridad, con una ventana de 5 s entre nodos.

Además, la vista más cara medida, el resumen de créditos por dependencia, paga dos
viajes en serie a Neon en cada carga.

La referencia fue la guía de Redis en ClassroomIO: un solo Redis para caché, rate
limiting, datos efímeros y una cola BullMQ, con Postgres como fuente de verdad.

## 2. Decisión

1. **Un solo cliente, ioredis 5, y opcional.** Sin `REDIS_URL` cada pieza conserva
   su adaptador de proceso, igual que el mailer y el storage eligen el suyo por
   entorno.
   - Se queda en la línea 5 y no en la 6: `ioredis-mock`, que permite probar Lua y
     pub/sub sin red, solo es compatible con la 5.
2. **Nada se cuelga ni se abre por Redis.** Los comandos fallan rápido (sin cola
   offline, con 250 ms de timeout) y cada pieza tiene un camino sin Redis:
   - el rate limiter vuelve a memoria, nunca a dejar pasar;
   - el corte de sesión vuelve a su TTL;
   - las cachés calculan o firman directo.
3. **Cuatro usos, en los puntos donde ClassroomIO los usa y donde aquí rinden:**
   - **Rate limiter** de ventana deslizante en un script Lua, más dos límites
     nuevos: cambios propios de inscripción y envío de cuestionarios. Los dos
     protegen un bloqueo de la fila del curso.
   - **Pub/sub de invalidación** del estado de seguridad. El corte de sesión llega
     a los demás nodos en un RTT en lugar de 5 s, sin cambiar el modo de fallo.
   - **Caché de URLs firmadas** del material de lección y de sesión, firmado en lote.
   - **Caché versionada** del resumen de créditos. Se invalida tras el commit con
     un `afterCommit` sobre la transacción ambiental.
4. **Política de memoria `allkeys-lru` sin persistencia.** Todo lo que vive en
   Redis se puede perder; no hay cola que proteger.

## 3. Lo que no se hace, y por qué

| Descartado | Por qué |
|---|---|
| Cola de trabajos (BullMQ) para el correo | El outbox de Postgres encola **dentro de la transacción** del caso de uso, con `FOR UPDATE SKIP LOCKED` entre réplicas ([ADR 0008](./0008-notificaciones-outbox-transaccional.md)). Una cola en Redis perdería esa garantía: avisaría de algo que se revirtió, o perdería un aviso de algo que sí pasó. |
| Single-flight distribuido del refresh | Guardaría pares de tokens, incluido el refresh, en Redis. El CAS de la rotación y la gracia persistida ya hacen correcto el refresh entre nodos ([auth/00 §6.2](../auth/00-sistema-autenticacion.md)); el single-flight local solo ahorra trabajo dentro del proceso. |
| Sesiones en Redis | Las sesiones viven en la base por diseño: revocar, auditar y detectar robo dependen de esa fila. |
| PDFs de certificados en caché | Son binarios de cientos de KB. Si hiciera falta, su lugar es el almacenamiento de objetos, no Redis. |
| Estadísticas de capacitadores | Una fase de dos consultas indexadas, con muchas fuentes de invalidación. Ganancia pequeña con riesgo de servir datos viejos (docs/reglas.md §26.5). |
| URL del proxy `/api/storage` | Cachearla acortaría la vida de la redirección que ya guarda el navegador. Alargar su firma para que valiera la pena dejaría vivo más tiempo un enlace privado filtrado. |
| Límite por IP en `/api/storage` | La institución sale por una sola IP con NAT y `X-Forwarded-For` se puede falsificar: castigaría a una oficina entera sin frenar a un atacante. |

## 4. Consecuencias

| Invariante | Dónde vive |
|---|---|
| Sin Redis, la app hace lo mismo que antes | Factories `*.factory.server.ts`, que eligen el adaptador por `REDIS_URL` |
| Una caída de Redis no abre el login | `createFallbackRateLimiter` |
| Un corte no se pierde por un aviso perdido | El TTL de la caché sigue siendo el tope; al reconectar se relee |
| Un valor calculado durante una invalidación no se sirve | Versiones leídas antes de calcular (`versioned-cache.redis.server.ts`) |
| No se invalida antes del commit | `afterCommit` en `runInTransaction` |
| Ninguna clave expone un email, una IP o una key de objeto | `redis.keys.server.ts` (SHA-256) |

**Se paga:**

- dos conexiones por proceso;
- un viaje de ~1 ms por límite, por lote de URLs y por lectura del resumen;
- con Redis caído, un límite efectivo de límite × nodos mientras dure la caída.

Referencia completa: [redis/00-redis.md](../redis/00-redis.md).
