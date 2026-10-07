# 1000 usuarios creando cursos: ¿Redis, BullMQ u otra cosa?

**Respuesta corta:** para crear cursos, BullMQ no aporta casi nada con 1000 usuarios. Redis sí, pero porque vas a necesitar varias réplicas, no por el wizard. Antes que BullMQ conviene revisar la conexión a la base y medir con una prueba de carga.

> Lo siguiente sale de leer el código; no se midió nada.

## Qué carga significan 1000 usuarios

Mil personas llenando el wizard a la vez no son mil peticiones por segundo. Cada una guarda un paso cada 30 a 60 s y navega entre pasos. Eso da del orden de **30 guardados por segundo** y unas decenas de lecturas por segundo. Es una estimación, no una medición.

## Por qué BullMQ no ayuda aquí

Guardar un paso tiene que responder en el momento:

- la persona necesita saber si quedó guardado;
- necesita ver el error de validación;
- necesita el `documentId` y las sesiones recién creadas para seguir.

Mandar ese guardado a una cola rompería la UI optimista sin hacerlo más rápido. La base hace el mismo trabajo, solo que más tarde.

Lo que BullMQ resuelve son los **efectos secundarios** (correos, recálculos, borrar archivos). Durante el alta de un curso casi no los hay, porque es un borrador sin inscritos.

## Dónde estaría el cuello de botella: Postgres

1. **Pool de conexiones sin configurar.** `PrismaPg` se crea solo con la URL (`app/core/db.server.ts:8`), así que queda el tope por defecto de `pg`: unas 10 conexiones por proceso.
   - Cada guardado abre una transacción con varias consultas a Neon, con un viaje completo cada una.
   - Con unos 30 guardados por segundo más las lecturas, las peticiones empezarían a hacer fila esperando conexión.
   - Esto se arregla con configuración, no con colas: tope explícito por proceso, la URL **pooled** de Neon (`-pooler`), y réplicas × tope por debajo del límite del plan de Neon.
2. **Varias réplicas.** Un solo proceso de Node no aguanta esa carga con holgura; van a hacer falta 2 o más. Ahí lo que ya se hizo con Redis deja de ser opcional en la práctica:
   - el límite de intentos se comparte entre réplicas;
   - el corte de sesión llega a todas;
   - la caché de créditos se comparte.
3. **El correo, hoy.** Cada réplica revisa el outbox en Neon cada 15 s, aunque no haya correos. Con varias réplicas son consultas constantes. Este sí es un beneficio real de BullMQ a esa escala, junto con un worker aparte que no le quite CPU a las peticiones.
4. **Portada del curso.** Pasa por el servidor (`request.formData()` la carga entera en memoria) antes de ir al almacenamiento. Con muchas subidas a la vez eso pesa en memoria. El material de lección ya sube directo al bucket con URL firmada, y la portada podría hacer lo mismo. Falta revisar el límite de tamaño.

## Orden recomendado

1. **Prueba de carga** (k6 o similar) de los dos caminos del wizard: abrir un paso y guardar un paso. Con 2 réplicas y Redis, para saber dónde se rompe de verdad (regla §26: medir antes).
2. **Configurar el pool y la URL pooled de Neon** según lo que salga de la prueba. Es un cambio chico con mucho efecto.
3. **Cachear las opciones de los selectores del wizard,** solo si la medición muestra que pesan. Se leen en cada paso de cada usuario, así que a esta escala sí podría valer la pena.
4. **BullMQ después.** Esta consideración no cambia su plan, solo confirma dos decisiones:
   - worker como **servicio aparte**;
   - **dos Redis**: uno de caché y otro de colas.

Nada de los puntos 1 a 3 se rehace cuando llegue BullMQ.

Relacionado: [REDIS-EN-EL-PROYECTO.md](REDIS-EN-EL-PROYECTO.md).

## Resultado de la prueba de carga (06-10-2026)

Se corrió y confirmó el diagnóstico. El detalle está en [docs/database/00-pool-de-conexiones.md](docs/database/00-pool-de-conexiones.md).

- **El pool por defecto ya falla con 250 usuarios:** con 10 conexiones, el 26 % de las altas da "Unable to start a transaction".
- **Con 80 conexiones, los 1000 usuarios pasan sin errores** en régimen estable. Guardar un paso tarda 1.3 s en p95, medido desde aquí a 80 ms de Neon.
- **Guardar un paso hace unos 11 viajes a la base en serie.** Lo que más ayuda en producción es poner el servidor cerca de la base, en el este de EE. UU.
- **Un proceso usa el 72 % de un núcleo** con 1000 usuarios: se recomiendan 2 réplicas con `DATABASE_POOL_MAX=20`.
- **Variables nuevas:** `DATABASE_POOL_MAX` y `DATABASE_POOL_WAIT_MS`.
