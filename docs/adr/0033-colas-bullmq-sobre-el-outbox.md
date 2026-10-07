# ADR 0033 · Colas con BullMQ sobre el outbox y un worker aparte

**Estado:** aceptado · 2026-10-06 · Reemplaza §2.4 y la fila "Cola de trabajos
(BullMQ) para el correo" de §3 del [ADR 0032](./0032-redis-opcional-cache-y-coordinacion.md).

## 1. Contexto

La prueba de carga del asistente de cursos
([database/00](../database/00-pool-de-conexiones.md)) mostró que un proceso web ya
usa el 72 % de un núcleo con 1000 usuarios. Aun así, el web cargaba con trabajo
que nadie espera en la respuesta:

- **Correo:** el outbox se revisaba cada 15 s con un `setInterval` en cada réplica.
  Eran consultas constantes a Neon y hasta 15 s de espera por correo.
- **Recálculo:** cambiar qué cuenta para el avance (lección obligatoria, evaluación
  de módulo, seguimiento cerrado) recalculaba a todo inscrito dentro del guardado
  del editor.
- **Borrado:** el objeto que ya nadie referencia se borraba "a ver si sale", sin
  reintento.
- **Mantenimiento:** no existía. La purga de sesiones expiradas era un botón.

La referencia fue la guía de colas de ClassroomIO: BullMQ v5 sobre ioredis, una
librería compartida, productores en el API y un worker en un proceso aparte.

## 2. Decisión

1. **BullMQ 5 (5.81.x), en un worker aparte.** Misma imagen que el web, otro
   comando: `node build/worker/index.js`.
   - **Por qué la 5:** la 6 salió el 30-07-2026 y agrega backends nuevos. La 5
     sigue mantenida, es la de la guía y usa exactamente nuestro `ioredis@5.11.1`.
   - Subir a la 6 queda pendiente de evaluar.
2. **El outbox de Postgres sigue siendo el aviso.** El correo se encola dentro de
   la transacción del caso de uso, como dice el [ADR 0008](./0008-notificaciones-outbox-transaccional.md).
   BullMQ solo lo entrega antes, con el patrón *transactional outbox + relay*:
   - **Tras el commit** (`afterCommit`) se encola `deliver-email` con
     `jobId = outbox-<id>-<intento>`.
   - **El worker** reserva la fila por id con un `UPDATE` condicional, la envía y
     la marca.
   - **El horario de reintentos sigue siendo el de la fila** (`RETRY_DELAYS_MIN`).
     El trabajo va con un solo intento: nunca hay dos relojes para el mismo
     mensaje.
   - **Un barrido cada 60 s** reencola lo vencido que no llegó a la cola: Redis
     caído al encolar, un reintento cuyo horario llegó, un worker que murió con la
     fila reservada.
3. **Nada se encola antes del commit.** Todo `dispatch` pasa por `afterCommit`: un
   trabajo de una transacción revertida nunca existe.
4. **Ningún trabajo se pierde si Redis falla.** Cada trabajo tiene una política de
   respaldo (`job-policies.ts`), y sin `REDIS_URL` todo corre donde corría antes:

   | Trabajo | Sin Redis, o si encolar falla |
   |---|---|
   | `deliver-email` | Lo entrega el poller (sin Redis) o el barrido (con Redis) |
   | `recalculate-progress` | Corre en el momento. Sin Redis, dentro de la transacción del editor, como antes |
   | `delete-object` | Corre en el momento, sin esperarlo |

5. **Avance eventual.** Con Redis, el avance de los demás inscritos se pone al día
   unos 2 s después del cambio del editor, no en la misma transacción.
   - Ediciones seguidas del mismo curso producen un solo recálculo
     (`deduplication` con `replace` y `keepLastIfActive`). Nunca corren dos
     recálculos del mismo curso a la vez, y una edición que llega con uno en curso
     produce otro al terminar.
   - Lo que la persona necesita ver al momento no cambia: su propio envío, su
     lección completada y los conteos del cierre del curso siguen en la petición.
6. **Un solo Redis** para caché y colas, decisión del usuario. Pasa a `noeviction`
   con AOF cada segundo:
   - expulsar claves podría borrar un trabajo o el candado de uno en curso;
   - bajo presión de memoria la caché ya degrada sin lanzar.
7. **Fallos definitivos en Postgres** (`org.job_failure`), salvo el correo, cuya
   fila `FAILED` ya cumple ese papel. Se purgan a los 30 días.
8. **Mantenimiento programado** con `upsertJobScheduler`, que es idempotente por id:
   una sola programación en el clúster aunque haya varios workers.

## 3. Lo que no se hace, y por qué

| Descartado | Por qué |
|---|---|
| Encolar el correo en Redis en lugar del outbox | Perdería la garantía del ADR 0008: avisaría de algo revertido o perdería un aviso de algo confirmado. |
| Reintentos del correo en BullMQ | Dos fuentes del horario: la fila y la cola discreparían tras un reinicio. |
| Diferir el envío propio, la lección propia o el cierre del curso | La persona ve el resultado en la misma pantalla. |
| Diferir el guardado del asistente de cursos | Necesita responder con validación e identidad; la cola solo movería el trabajo, no lo quitaría. |
| Pre-generar los PDF de certificados | Es una descarga a pedido; su lugar sería el almacenamiento de objetos, con otra decisión. |
| Panel de colas (Bull Board) | Exige autenticación propia; se revisan con `redis-cli` y `job_failure`. |
| Redis separado para colas | El usuario eligió uno solo; queda como mejora si la memoria aprieta. |

## 4. Consecuencias

| Invariante | Dónde vive |
|---|---|
| Un trabajo de una transacción revertida no existe | `job-dispatcher.queued.server.ts` (`afterCommit`) |
| El mismo correo no sale dos veces por la cola | `claimById` (`UPDATE` condicional) y `outboxJobId` |
| Un correo que no llegó a la cola sale igual | El barrido (`sweepOutbox`) |
| Sin Redis la app hace lo de antes | `job-dispatcher.inline.ts` y `FALLBACK_POLICY` |
| Un trabajo que no se entiende no se reintenta | `queue.processor.server.ts` (`UnrecoverableError`) |
| Un trabajo agotado deja rastro | `org.job_failure` |

**Se paga:**
- un servicio más en Railway;
- con `REDIS_URL`, **el worker es obligatorio**: el web deja de sondear el outbox;
- dos conexiones más a Redis por proceso web (productor) y una por cola en el worker.

**Medido el 06-10-2026** (servidor recién arrancado, Neon a 80 ms), al cambiar
"obligatoria" en una lección de un curso publicado con 5 inscritos:

| | Consultas | Tiempo |
|---|---|---|
| Sin Redis (recálculo en la petición) | 14 | ~1.2 s |
| Con Redis (recálculo en la cola) | **4** | **~0.4 s** |

Sin Redis hay 1 consulta más que antes de la cola: el handler relee el curso. El
recálculo crece con los inscritos; con la cola, el guardado del editor ya no.

Referencia operativa: [queues/00-colas.md](../queues/00-colas.md).
