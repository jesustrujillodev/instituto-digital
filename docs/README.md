# Documentación técnica

## Contexto y objetivo del proyecto

Esta aplicación es una **plantilla base** destinada a replicarse en múltiples
proyectos a la medida que convergen en los mismos requerimientos:

1. Autenticación (sesiones con access/refresh token).
2. CRUD de usuarios con distintos roles y control de acceso basado en roles (RBAC)
   — *el RBAC y la capa de enrutado ya están integrados*: gate estructural de
   autenticación por `layout()`, `requireRole` como punto único de autorización
   (responde 403), navegación filtrada por rol y guards de UI. Ver
   [routing/00-sistema-enrutado.md](./routing/00-sistema-enrutado.md). El CRUD de
   usuarios está implementado, y sobre él se monta el aislamiento por
   dependencia del instituto: ver
   [dependencies/00-dependencias-y-alcance.md](./dependencies/00-dependencias-y-alcance.md).
3. Administración de almacenamiento en la nube (S3/GCS) — *ya integrado*: puerto
   `IStorageProvider` en dominio, adaptadores S3/GCS intercambiables en
   infraestructura, proxy con autorización por prefijo colgada de
   `requireAuth`/`requireRole`. Ver [storage/00-sistema-almacenamiento.md](./storage/00-sistema-almacenamiento.md).

Ese objetivo gobierna las decisiones de diseño documentadas aquí: todo lo
transversal se expresa como **puerto + adaptador intercambiable** (memoria hoy,
Redis/estructurado mañana), de modo que cada proyecto derivado cambie
adaptadores y configuración sin tocar dominio ni aplicación.

## Alcance y convenciones

Documentación de análisis y diseño del proyecto. Los documentos están escritos
para ser **agnósticos al framework**: describen los contratos en términos de
puertos y adaptadores (arquitectura hexagonal), de modo que el diseño sea
replicable en otros proyectos. Las referencias a React Router / Prisma / Awilix
se marcan explícitamente como detalles del adaptador.

## Índice

| Documento | Contenido |
|---|---|
| [auth/00-sistema-autenticacion.md](./auth/00-sistema-autenticacion.md) | **Referencia principal.** Documentación de punta a punta del sistema de autenticación *como está implementado*: arquitectura, modelo de datos, configuración, flujos (login, silent refresh, logout), RBAC, propiedades de seguridad y guía de portabilidad a otros proyectos. |
| [auth/02-revocacion-inmediata-epoch.md](./auth/02-revocacion-inmediata-epoch.md) | **Referencia de lo implementado (Fase A).** El *epoch* de validez que hace que revocar corte el acceso **en curso** y no solo la renovación: granularidad global y por usuario, por qué el epoch por usuario no reintroduce una consulta por petición, el TTL de caché como único dial entre coste y propagación, el modo de fallo cuando la base no responde (último valor conocido / denegar en frío) y la tabla de latencia por acción del monitor. |
| [auth/03-lockdown.md](./auth/03-lockdown.md) | **Referencia de lo implementado (Fase B).** El lockdown propiamente dicho: bloquea `login` y `refresh` mientras dure el cierre, con alcance `all` o `except-admin`. Semántica del cierre, las tres escrituras atómicas y por qué, qué se purga en cada alcance, break-glass por CLI, qué ve quien queda bloqueado, auditoría y el runbook de rotación de secretos posterior. |
| [routing/00-sistema-enrutado.md](./routing/00-sistema-enrutado.md) | **Referencia principal de enrutado.** Documentación de punta a punta de la capa de rutas *como está implementada*: composición del árbol en tres zonas, gate estructural de autenticación por `layout()`, autorización por rol con respuesta 403, detección tipada de errores, boundaries, navegación declarativa filtrada por rol y guards de UI. Complementa a auth/00: aquél documenta *quién es el usuario*, éste *a dónde puede llegar y qué ve*. |
| [theme/00-modo-oscuro.md](./theme/00-modo-oscuro.md) | **Referencia de lo implementado (Fase A).** El modo oscuro de punta a punta: por qué la cookie manda sobre la columna de la cuenta, cómo se sirve el tema sin flash y sin JavaScript (el `@media` que emite el propio CSS del tema), el `@custom-variant dark` de dos ramas que mantiene vivas las utilidades `dark:` en modo sistema, por qué los valores de los tokens salieron de `app.css`, y los modos de fallo. |
| [theme/01-theme-builder.md](./theme/01-theme-builder.md) | **Referencia de lo implementado (Fase B).** El theme builder de `/dashboard/personalizacion`: biblioteca con borrador/publicado y un solo tema activo por construcción, de dónde salen ahora los tokens y por qué la caché del tema activo degrada donde la de seguridad deniega, el prefijo `--theme-*` que evita pelearse con las claves de Tailwind, preview en vivo sobre el documento entero, "probar en toda la app" con la cookie que **no** autoriza nada, contraste WCAG que avisa sin bloquear, derivar oscuro, el picker OKLCH escrito a mano e import/export con round-trip probado. |
| [storage/00-sistema-almacenamiento.md](./storage/00-sistema-almacenamiento.md) | **Referencia principal de storage.** Documentación de punta a punta de la abstracción de almacenamiento de objetos (S3/GCS) *como está implementada*: puerto y adaptadores, convención de referencias, configuración, flujos (subida, lectura, reemplazo), el proxy, política de acceso por prefijo, propiedades de seguridad y guía de portabilidad. |
| [cloud/00-gestor-nube.md](./cloud/00-gestor-nube.md) | **Referencia del gestor de nube.** `/dashboard/nube` *como está implementado*: árbol unificado sobre los dos buckets, referencias de storage publicadas por cada módulo sin acoplar el gestor a ellos, borrado en cascada (la base antes que los objetos), detección de huérfanos con ventana de gracia, ZIP armado en el navegador con URLs firmadas y CORS, límites y amenazas. |
| [dependencies/00-dependencias-y-alcance.md](./dependencies/00-dependencias-y-alcance.md) | **Referencia del aislamiento por dependencia.** Quién ve qué y por qué: los cinco roles y su alcance, el claim `dependencyId` y por qué viaja firmado en vez de resolverse por petición, el filtro dentro del `where` que hace que fuera de alcance responda igual que inexistente, las dos invariantes que impone la base porque Prisma no las expresa (un solo titular por dependencia activa, coherencia interno/externo), el orden obligatorio de `assignHead` y la bitácora de adscripción. |
| [trainers/00-capacitadores-y-grupos.md](./trainers/00-capacitadores-y-grupos.md) | **Referencia del catálogo de capacitadores y de los grupos.** Por qué el perfil de capacitador es una extensión de la cuenta y no un rol, el claim `isTrainer` y qué se paga por él, el único guard del sistema cuya condición de entrada no es un rol, la escritura compuesta que crea cuenta y perfil de un externo en una sola transacción ambiental, y la regla que decide los miembros de un grupo por la dependencia DEL GRUPO y no por la de quien administra. |
| [courses/00-cursos-sesiones-y-acceso.md](./courses/00-cursos-sesiones-y-acceso.md) | **Referencia de cursos, sesiones y acceso.** El alcance propio del módulo y su variante `creator` para el capacitador interno, quién elige la dependencia organizadora, la regla de visibilidad escrita antes de su primera pantalla, las horas guardadas en UTC y capturadas en la zona del instituto, por qué un borrador puede estar incompleto y qué exige publicar, y por qué las sesiones se diferencian por `documentId` en vez de recrearse. |
| [enrollments/00-inscripcion-e-invitaciones.md](./enrollments/00-inscripcion-e-invitaciones.md) | **Referencia de inscripción e invitaciones.** Cursos disponibles, inscripción propia contra cupo, baja, asignación por titular o auxiliar, invitaciones a personas o grupos y "Mis cursos": la máquina de estados de una fila por persona y curso, quién asigna o invita con qué alcance, el cupo serializado con el bloqueo de la fila del curso y los avisos por correo que encola cada operación. |
| [teaching/00-imparticion-creditos-y-valoracion.md](./teaching/00-imparticion-creditos-y-valoracion.md) | **Referencia de impartición, créditos y valoración.** Pase de lista por sesión, resultados, el cierre que calcula quién completó y otorga créditos, la corrección posterior que recalcula todo con la fila del curso bloqueada, el crédito que se retira sin borrarse y conserva su dependencia, las tres pantallas de créditos por alcance y la valoración anónima desde la consulta. |
| [annual-plan/00-plan-anual.md](./annual-plan/00-plan-anual.md) | **Referencia del plan anual.** Plan por dependencia y ejercicio, líneas con estado derivado del curso vinculado (nadie lo escribe), avance, solo lectura de ejercicios pasados, qué se permite sobre cada línea y cómo "Crear curso desde esta línea" ocupa la línea con su fila bloqueada. |
| [notifications/00-notificaciones.md](./notifications/00-notificaciones.md) | **Referencia de las notificaciones por correo.** Los ocho avisos de §6.12 y dónde se encolan, el ciclo de vida de un mensaje en el outbox (reserva, reintentos, fallo definitivo y purga), la configuración SMTP con Mailpit para desarrollo, las consultas de diagnóstico y cómo añadir una plantilla. |
| [access/00-roles-perfil-y-participacion.md](./access/00-roles-perfil-y-participacion.md) | **Glosario de acceso.** Qué es un rol, qué es el perfil de capacitador, qué es participar y qué es el alcance, cómo se calcula cada uno y en qué se diferencian, con la referencia exacta al código y al ADR que lo sostiene. Explica por qué un titular o un auxiliar pueden inscribirse a cursos sin tener rol `USER`. |
| [adr/0001-modelo-de-roles-y-alcance-por-dependencia.md](./adr/0001-modelo-de-roles-y-alcance-por-dependencia.md) | **Decisión de arquitectura.** Por qué rol escalar en `User` y no tabla de membresías, por qué el alcance viaja en el token y qué se paga por ello, y por qué es un parámetro explícito y no un valor del contenedor. Incluye qué obligaría a revisar cada decisión y las alternativas descartadas. |
| [adr/0002-perfil-de-capacitador-y-transaccion-entre-modulos.md](./adr/0002-perfil-de-capacitador-y-transaccion-entre-modulos.md) | **Decisión de arquitectura.** Por qué el perfil de capacitador extiende la cuenta en vez de ser un rol o una tabla aparte, por qué `isTrainer` viaja firmado y se deriva sin columna propia, y por qué una transacción SÍ puede repartirse entre dos repositorios — lo que retira una consecuencia del ADR 0001. Incluye las tres invariantes que la base no puede imponer y las alternativas descartadas. |
| [adr/0003-alcance-de-cursos-y-audiencia.md](./adr/0003-alcance-de-cursos-y-audiencia.md) | **Decisión de arquitectura.** Por qué cursos tiene un alcance propio en vez de ampliar `AccessScope`, por qué la audiencia son dos tablas y no una con columnas nulas, y por qué las horas se guardan en UTC con una sola zona del instituto. Incluye las invariantes que la base no impone y las alternativas descartadas. |
| [adr/0004-inscripcion-una-fila-y-cupo-con-bloqueo.md](./adr/0004-inscripcion-una-fila-y-cupo-con-bloqueo.md) | **Decisión de arquitectura.** Por qué la inscripción es una fila por persona y curso en vez de una por evento, por qué el cupo se protege bloqueando la fila del curso y no con un contador o aislamiento serializable, y por qué la visibilidad de un curso por invitación sale de la inscripción. Incluye las invariantes que la base no impone. |
| [adr/0005-calendario-como-proyeccion-de-lectura.md](./adr/0005-calendario-como-proyeccion-de-lectura.md) | **Decisión de arquitectura.** Por qué el calendario es un módulo de solo lectura con su propia consulta y por qué etiqueta cada sesión con lentes que se suman en vez de un alcance único. |
| [adr/0006-imparticion-creditos-y-valoracion.md](./adr/0006-imparticion-creditos-y-valoracion.md) | **Decisión de arquitectura.** Por qué la escritura del cierre pasa por los puertos de tres módulos, por qué toda escritura sobre un curso finalizado recalcula en vez de aplicar un delta, por qué el crédito se retira con `revoked_at` y conserva su dependencia al restaurarse, y cómo se reparten impartir y corregir. |
| [adr/0007-plan-anual-estado-derivado.md](./adr/0007-plan-anual-estado-derivado.md) | **Decisión de arquitectura.** Por qué el estado de la línea se deriva en lugar de sincronizarse desde cursos e impartición, por qué el curso cancelado conserva su vínculo y "un curso por línea" se protege bloqueando la línea, y por qué borrar solo corrige capturas. |
| [adr/0008-notificaciones-outbox-transaccional.md](./adr/0008-notificaciones-outbox-transaccional.md) | **Decisión de arquitectura.** Por qué el aviso se encola en la misma transacción del caso de uso y no se dispara tras el commit, por qué se redacta al encolar, cómo `SKIP LOCKED` evita duplicados entre réplicas, por qué no es la bitácora que §8 descarta y por qué ningún correo lleva contraseñas. |
| [testing/00-inventario-tests.md](./testing/00-inventario-tests.md) | **Inventario de la suite.** Qué se prueba hoy, archivo por archivo y agrupado por feature, con el nombre de cada test tal como lo reporta el runner. Incluye los comandos de Vitest y la sección de huecos conocidos (componentes, rutas, integración con base, storage). |

**Por dónde empezar:** [auth/00-sistema-autenticacion.md](./auth/00-sistema-autenticacion.md)
describe el sistema vigente de identidad de punta a punta. Después,
[routing/00-sistema-enrutado.md](./routing/00-sistema-enrutado.md) explica cómo esa
identidad se traduce en acceso a rutas y en UI. La abstracción de almacenamiento
se documenta en [storage/00-sistema-almacenamiento.md](./storage/00-sistema-almacenamiento.md).
