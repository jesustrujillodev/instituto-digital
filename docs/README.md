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
| [adr/0001-modelo-de-roles-y-alcance-por-dependencia.md](./adr/0001-modelo-de-roles-y-alcance-por-dependencia.md) | **Decisión de arquitectura.** Por qué rol escalar en `User` y no tabla de membresías, por qué el alcance viaja en el token y qué se paga por ello, y por qué es un parámetro explícito y no un valor del contenedor. Incluye qué obligaría a revisar cada decisión y las alternativas descartadas. |
| [testing/00-inventario-tests.md](./testing/00-inventario-tests.md) | **Inventario de la suite.** Qué se prueba hoy, archivo por archivo y agrupado por feature, con el nombre de cada test tal como lo reporta el runner. Incluye los comandos de Vitest y la sección de huecos conocidos (componentes, rutas, integración con base, storage). |
| [multi-tenancy/00-diseno-multi-tenant.md](./multi-tenancy/00-diseno-multi-tenant.md) | **Diseño (aún no implementado).** Qué se necesita y por qué para que la plantilla sirva como SaaS multi-tenant (una base por tenant, resuelta por dominio) y como proyecto a la medida (un solo tenant), con la implementación conceptual sobre la arquitectura actual y la infraestructura fuera de la app (entrada/TLS, aprovisionamiento de bases, migraciones N-way, billing). |

**Por dónde empezar:** [auth/00-sistema-autenticacion.md](./auth/00-sistema-autenticacion.md)
describe el sistema vigente de identidad de punta a punta. Después,
[routing/00-sistema-enrutado.md](./routing/00-sistema-enrutado.md) explica cómo esa
identidad se traduce en acceso a rutas y en UI. La abstracción de almacenamiento
se documenta en [storage/00-sistema-almacenamiento.md](./storage/00-sistema-almacenamiento.md).
