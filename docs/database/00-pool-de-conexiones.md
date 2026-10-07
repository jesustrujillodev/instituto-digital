# Pool de conexiones y capacidad del asistente de cursos

## 1. Qué se configura

Cada transacción de Prisma retiene una conexión del pool de `pg` desde que empieza hasta el commit. Por eso el tope del pool decide cuántos guardados caben a la vez en un proceso.

| Variable | Default | Qué hace |
|---|---|---|
| `DATABASE_POOL_MAX` | `10` | Conexiones por proceso. El default es el que `pg` ya usaba. |
| `DATABASE_POOL_WAIT_MS` | `2000` | Cuánto espera una consulta o una transacción por una conexión libre. Es el `maxWait` que Prisma ya usaba para las transacciones. |

Las dos se aplican en `app/core/db.server.ts`.

**Cambio de comportamiento:** antes, una consulta suelta (fuera de transacción) esperaba sin límite cuando el pool estaba lleno. Ahora falla tras `DATABASE_POOL_WAIT_MS`, igual que una transacción. Con el pool saturado es preferible un error a una petición colgada.

**La regla que no se rompe:** réplicas × `DATABASE_POOL_MAX` tiene que caber en el `max_connections` de la base. Si se usa el pooler de Neon, tiene que caber en el límite del pooler.

## 2. Medición (06-10-2026)

**Escenario:**
- Prueba hecha con `scripts/load-test-wizard.ts` (ver §4).
- Cada usuario virtual da de alta un borrador y luego alterna abrir un paso y guardarlo, con 15 s de pausa media entre acciones.
- 1000 usuarios con esa pausa equivalen a unas **26 aperturas y 26 guardados por segundo**.
- La prueba la generó un solo proceso de `react-router-serve` en build de producción, en la misma máquina que la carga.
- Base Neon de desarrollo en us-east-2 (`max_connections` 901), a **80 ms** de ida y vuelta.

| Pool | Usuarios | Errores | p95 abrir paso | p95 guardar paso | Causa de los errores |
|---|---|---|---|---|---|
| 10, directa | 250 | 70 (26 % de las altas) | 4.3 s | 2.2 s | `Unable to start a transaction in the given time` |
| 30, directa | 250 | 0 | 0.44 s | 0.97 s | — |
| 30, directa | 1000 | 670 | 7.1 s | 5.6 s | pool lleno (`timeout exceeded when trying to connect`) |
| **80, directa** | **1000** | **1** | **0.71 s** (estable) | **1.31 s** (estable) | — |
| 80, pooler | 1000 | 11 | 6.0 s (con arranque) | 3.5 s (con arranque) | pool lleno durante el arranque |

"Estable" excluye los primeros 30 s. En ese tramo los 1000 usuarios dan de alta su curso de golpe (unas 67 altas por segundo) y el pool abre sus conexiones con TLS, a unos 500 ms cada una.

**Del proceso del servidor en la corrida de 80 conexiones:**
- 127 s de CPU en 176 s, es decir, un **72 % de un núcleo**;
- pico de memoria de **unos 940 MB**.

**Lo que explican los números:**
- **Guardar un paso hace unos 11 viajes a la base en serie:** 920 ms de p50 ÷ 80 ms por viaje. Esa es la duración de la transacción y, por tanto, el tiempo que retiene su conexión.
- **Las conexiones necesarias** se estiman como transacciones por segundo × duración de cada una × margen. Con 80 ms por viaje hacen falta unas 30 a 50 a la vez, y por eso 30 se queda corto y 80 alcanza.
- **El pooler de Neon no acelera un solo proceso:** suma un salto. Su valor está en sostener muchas réplicas sin agotar `max_connections`.

## 3. Recomendación para producción

1. **Railway en la región más cercana a Neon.** La base está en us-east-2 (Ohio); el servicio debería correr en la región de Railway en el este de EE. UU.
   - Con unos 10 ms por viaje, un guardado retiene la conexión unos 110 ms en lugar de 920. Eso necesita 8 veces menos conexiones.
   - Es el ajuste con más efecto, y no cambia código.
2. **Dos réplicas con `DATABASE_POOL_MAX=20` cada una.**
   - Un proceso ya usa el 72 % de un núcleo con 1000 usuarios, así que la segunda réplica da margen y tolera la caída de una.
   - 40 conexiones caben con holgura en `max_connections`.
   - Con varias réplicas, Redis (`REDIS_URL`) comparte el límite de intentos y el corte de sesión: [redis/00-redis.md](../redis/00-redis.md).
3. **Conexión directa mientras réplicas × tope quepa en la base.** El `max_connections` de Neon depende del tamaño del compute: es 901 en el de desarrollo y mucho menor en el compute mínimo.
   - Si se acerca al límite, se usa la URL `-pooler` para la app.
   - En ese caso, `prisma db push` y las migraciones siguen yendo por la URL directa: el pooler trabaja por transacción y no conserva la sesión.
4. **Memoria de al menos 1 GB por réplica** hasta investigar el pico de unos 940 MB.
5. **El siguiente ajuste de código** es bajar los unos 11 viajes en serie de `courseService.update` (docs/reglas.md §26). Acortaría a la vez la latencia y el tiempo que el guardado retiene su conexión.

**Pendiente:** repetir la prueba desde Railway (staging) contra su base, para tener números con la latencia real de producción.

## 4. Cómo repetir la prueba

```bash
bun run build
NODE_ENV=production PORT=3100 DATABASE_POOL_MAX=20 \
  node node_modules/@react-router/serve/bin.js ./build/server/index.js

bun scripts/load-test-wizard.ts --base=http://localhost:3100 \
  --users=1000 --think=15000 --duration=150
```

**Antes de correrla:**
- **Sesión:** el script inicia sesión una vez con una cuenta del seed (`--email`), y su token de acceso dura 5 min. Cada corrida debe caber en ese tiempo.
- **Límite de login:** permite 5 intentos por correo cada 60 s. Para corridas seguidas conviene alternar cuentas, por ejemplo `laura.sop@…` y `carlos.sop@…`.
- **Limpieza:** al terminar, el script borra los borradores `LOADTEST <corrida>` usando el `DATABASE_URL` de quien lo ejecuta, que debe ser la misma base del servidor probado. Si una corrida se interrumpe, `--cleanup` borra lo que quedó.
