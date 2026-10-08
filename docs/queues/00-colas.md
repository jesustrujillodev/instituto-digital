# Colas de trabajo (BullMQ) — Referencia de punta a punta

**Última actualización:** 2026-10-06 · Describe las colas **como están
implementadas**. La decisión está en
[ADR 0033](../adr/0033-colas-bullmq-sobre-el-outbox.md).

---

## 1. Qué es

El trabajo que nadie espera en la respuesta (entregar un correo, recalcular el
avance de un curso, borrar un archivo viejo, purgar lo vencido) sale de la
petición y lo hace un **worker**: un proceso aparte con la misma imagen.

**Reglas:**
- **Redis solo transporta; Postgres guarda el estado.** Los trabajos llevan solo
  ids y el worker relee la base.
- **Nada se encola antes del commit.**
- **Sin `REDIS_URL` no hay colas:** cada trabajo corre donde corría antes (§5).

## 2. Piezas

| Archivo | Qué hace |
|---|---|
| `app/shared/queue/queue.config.ts` | Nombres de colas y trabajos (las únicas cadenas permitidas), defaults por cola, programación del mantenimiento |
| `app/shared/queue/queue.payloads.ts` | Esquema valibot de cada payload; el worker valida al sacar |
| `app/shared/queue/queue.job-options.ts` | `jobId` del correo y deduplicación del recálculo |
| `app/shared/queue/job-dispatcher.ts` | Puerto `JobDispatcher.dispatch(name, payload)` y tipo `JobHandlers` |
| `app/shared/queue/job-dispatcher.queued.server.ts` | Encola tras el commit; si falla, aplica el respaldo |
| `app/shared/queue/job-dispatcher.inline.ts` | Sin Redis: aplica el respaldo de inmediato |
| `app/shared/queue/job-policies.ts` | Respaldo de cada trabajo: `skip`, `await` o `background` |
| `app/shared/queue/queue.client.server.ts` | Conexiones propias de BullMQ y colas perezosas |
| `app/shared/queue/queue.processor.server.ts` | Valida y enruta un trabajo; qué fallo va a `job_failure` |
| `app/shared/di/job-handlers.server.ts` | Qué hace cada trabajo, armado desde el cradle |
| `app/worker.server.ts` | El proceso: un `Worker` por cola, programación, apagado ordenado |

Los casos de uso piden `jobDispatcher` por el cradle; nunca tocan BullMQ.

## 3. Inventario

| Cola | Trabajo | Quién lo encola | Intentos / backoff | Concurrencia |
|---|---|---|---|---|
| `emails` | `deliver-email` | `notificationService.notify`, por cada fila del outbox | 1 (los reintentos son de la fila) | `QUEUE_EMAIL_CONCURRENCY` (5) |
| `emails` | `sweep-outbox` | Programado cada 60 s | 1 | — |
| `course-sync` | `recalculate-progress` | `content.service` (lección obligatoria) y `quiz.service` (evaluación de módulo, cierre de seguimiento) | 3 / 30 s exp. | `QUEUE_COURSE_SYNC_CONCURRENCY` (2) |
| `storage` | `delete-object` | `discardObject` de cursos y de material | 5 / 30 s exp. | `QUEUE_STORAGE_CONCURRENCY` (5) |
| `maintenance` | `purge-expired-sessions` | Diario, 03:00 `America/Tijuana` | 2 / 60 s | 1 |
| `maintenance` | `purge-sent-emails` | Diario, 03:15 | 2 / 60 s | 1 |
| `maintenance` | `purge-job-failures` | Diario, 03:30 (borra los de más de 30 días) | 2 / 60 s | 1 |

**Retención en Redis:**
- correo: 6 h los completados y 7 días los fallidos;
- recálculo y borrado: 1 día y 14 días;
- mantenimiento: 1 día y 7 días.

## 4. Ciclo de vida

**Correo:**
1. El caso de uso escribe la fila del outbox en su transacción.
2. Tras el commit se encola `deliver-email` con `jobId outbox-<id>-<intento>`.
3. El worker reserva la fila por id. Si ya salió o la tiene otro, termina sin hacer nada.
4. Envía la fila y la marca `SENT`, o le pone su siguiente intento según `RETRY_DELAYS_MIN`. Agotados los intentos queda `FAILED`.
5. El barrido de cada minuto encola lo vencido: el siguiente intento, lo que no llegó a la cola, lo que un worker caído dejó reservado. El `jobId` determinista evita duplicados.

**Recálculo:**
1. El editor confirma su cambio.
2. Se encola con 2 s de espera y deduplicación por curso:
   - mientras espera, otra edición lo reemplaza y reinicia la espera;
   - si llega una edición mientras corre, se guarda y corre al terminar.
3. El worker relee el curso. Si ya no está publicado, no hace nada; si lo está, recalcula con la fila del curso bloqueada (`lockCourse`).

**Borrado:** si el objeto ya no existe cuenta como borrado. Agotado, queda en `job_failure` y el gestor de nube lo sigue viendo como huérfano.

**Fallos:**
- un nombre de trabajo desconocido o un payload inválido lanza `UnrecoverableError` y no se reintenta;
- todo fallo definitivo, salvo el correo, se guarda en `org.job_failure`.

## 5. Sin Redis, o con Redis caído

| Trabajo | Sin `REDIS_URL` | Con Redis caído al encolar |
|---|---|---|
| Correo | Lo entrega el poller del web cada `EMAIL_WORKER_INTERVAL_S` | Queda en el outbox; lo encola el barrido al volver Redis |
| Recálculo | Dentro de la transacción del editor, como antes | Corre en la petición, tras el commit |
| Borrado | En el momento, sin esperarlo | En el momento, sin esperarlo |
| Mantenimiento | No corre (el botón de sesiones sigue) | Corre cuando vuelve |

Encolar tiene un tope de 1 s: un Redis lento no cuelga una petición.

## 6. Despliegue

**Desarrollo:**

```bash
docker compose up -d redis mailpit
REDIS_URL="redis://localhost:6379"   # en .env
bun run dev                          # web
bun run worker                       # worker, en otra terminal
```

**Railway:**
1. **Redis:** `noeviction`, `appendonly yes`, `appendfsync everysec`, volumen persistente y `maxmemory` holgado. Ver [redis/00 §8](../redis/00-redis.md).
2. **Web:** sin cambios, con `REDIS_URL` por referencia a la URL privada.
3. **Worker:** un servicio nuevo desde el mismo repositorio e imagen, con start command `node build/worker/index.js` y las mismas variables que el web (base, Redis, SMTP, storage). No expone puerto.
4. **Checklist:** con `REDIS_URL`, **el worker es obligatorio**: el web deja de sondear el outbox y sin worker no sale ningún correo.
5. Un deploy manda `SIGTERM`: el worker termina los trabajos en curso antes de salir.

## 7. Diagnóstico

```bash
redis-cli --scan --pattern 'idc:bull:*' | cut -d: -f1-3 | sort -u   # colas
redis-cli LLEN idc:bull:emails:wait                                  # correos en espera
redis-cli ZCARD idc:bull:course-sync:failed                          # recálculos fallidos
```

```sql
-- Fallos definitivos (no incluye correo: ver notifications/00 §5)
SELECT id, queue, name, job_id, attempts, failed_at, left(error, 200)
FROM org.job_failure ORDER BY failed_at DESC LIMIT 50;
```

Para reencolar un fallo, se repite su payload con `bun scripts/…` o desde un REPL con
`createQueueClient(...).add(name, payload)` y se borra la fila.

## 8. Pruebas

- **Piezas puras y dispatchers:** se prueban con dobles a mano.
- **El contrato que importa:**
  - se encola tras el commit;
  - un rollback no deja trabajo;
  - si encolar falla, aplica el respaldo.
- **Con Redis real:** `queue.client.server.test.ts` corre solo con `REDIS_TEST_URL` (`ioredis-mock` no ejecuta los scripts de BullMQ). Comprueba:
  - entrega;
  - `jobId` del correo sin duplicados;
  - debounce del recálculo, incluida una edición durante un recálculo activo;
  - scheduler idempotente.
- **Fuera de cobertura:** `queue.client.server.ts` y `app/worker.server.ts`, que son cableado.
