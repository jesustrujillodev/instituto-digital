# AGENTS

## Proposito

Este archivo define instrucciones globales para agentes de IA que colaboran en este repositorio (por ejemplo: GitHub Copilot en VS Code, Claude Code y agentes compatibles con AGENTS.md).

## Fuente de verdad arquitectonica

Antes de implementar cualquier feature, bugfix, refactor o prueba, el agente debe leer y aplicar:

- docs/reglas.md

Si hay conflicto entre una decision tecnica y este estandar, prevalece el estandar, salvo instruccion explicita del usuario.

## Politica obligatoria por feature

Para cada cambio, el agente debe validar y respetar:

1. Estructura modular por modulo en app/modules/<modulo>, separada en subcarpetas domain/, application/, infrastructure/ y routes/.
2. Taxonomia de archivos por modulo:
    - domain/<modulo>.types.ts: tipos y modelos de dominio.
    - domain/<modulo>.errors.ts: errores de dominio/aplicacion.
    - domain/<modulo>.rules.ts: reglas de negocio puras.
    - domain/<modulo>.validators.ts: contratos de validacion de entrada/salida en frontera (no existen `<modulo>.schema.ts` de ORM por modulo; el schema de base de datos es unico y vive en prisma/schema.prisma).
    - domain/<modulo>.mapper.ts: conversion entre modelos externos, internos y DTO.
    - domain/<modulo>.service.ts y domain/<modulo>.repository.ts: puertos/contratos (interfaces), sin implementacion concreta.
    - domain/<modulo>.config.ts (opcional): configuracion propia del modulo.
    - application/<modulo>.service.server.ts: implementacion de casos de uso (siempre server-only, ver regla de sufijo `.server`).
    - infrastructure/<modulo>.repository.server.ts: adaptador de persistencia u otra integracion externa (siempre server-only).
    - routes/routes.config.ts: registro de rutas del modulo.
    - routes/<nombre-ruta>/index.tsx, index.loader.ts, index.action.ts: adaptadores inbound del filesystem router de React Router (condicional: solo las piezas que el modulo realmente exponga).
3. Logica de negocio agnostica al framework.
4. Errores de dominio/aplicacion desacoplados de HTTP/framework.
5. Regla de comentarios del estandar (secciones, JSDoc util, sin ruido).
6. Pruebas minimas por modulo (service/repository/inbound-adapter) segun el estandar, ubicadas en `__tests__/` por capa y cubriendo toda operacion que mute la base (ver secciones de pruebas mas abajo).
7. Contrato estandar de respuestas (ver seccion siguiente y docs/reglas.md §25).

## Contrato estandar de respuestas (obligatorio)

Todo servicio de `application/` devuelve el envelope `AppResponse<T>`, y todo loader/action lo consume. Nadie inventa su propia forma de respuesta.

### Piezas (no duplicar ninguna)

| Archivo | Que aporta |
| --- | --- |
| `app/shared/rules/response.rules.ts` | Esquemas valibot del contrato + `RESPONSE_ERROR_CODES`. Fuente de verdad. |
| `app/shared/response/response.types.ts` | `AppResponse<T>`, `OkResponse<T>`, `FailResponse`, `PaginationMeta`. Derivados de los esquemas. |
| `app/shared/response/response.helpers.ts` | `ok`, `fail`, `isOk`, `isFail`, `toPaginationMeta`, `toResponseError`, `parseInput`. |
| `app/shared/response/run-operation.ts` | `createOperationRunner(logger)` — envuelve cada caso de uso. |
| `app/shared/response/response.messages.ts` | `localizeError`, `failFrom`, `ErrorMessageMap`. |
| `app/shared/errors/domain-error.ts` | `DomainError`, base de TODO error de negocio. |
| `app/shared/http/route-error.ts` | `toRouteError(error, messages)` — del envelope al status HTTP. |

### Reglas por capa

1. **`domain/<modulo>.errors.ts`**: exporta `<MODULO>_ERROR_CODES` (constante) y clases que extienden `DomainError`. `details` para lo que el adaptador necesite interpolar.
2. **`domain/<modulo>.service.ts`** (puerto): todos los metodos consumidos por loaders/actions devuelven `AppResponse<T>`. Una excepcion (metodo de middleware que sigue lanzando) exige comentario que la justifique.
3. **`application/<modulo>.service.server.ts`**: recibe `logger` por DI, crea `const run = createOperationRunner(logger.child({ module: "<modulo>" }))` y envuelve TODA operacion. Devuelve `ok(...)`; deja que el repositorio lance.
4. **`infrastructure/<modulo>.repository.server.ts`**: sin cambios de contrato — sigue devolviendo dominio crudo y lanzando errores tipados.
5. **`utils/<modulo>-error-messages.ts`**: diccionario `ErrorMessageMap` con entrada de reserva para `RESPONSE_ERROR_CODES.UNEXPECTED`.
6. **Loaders**: `if (!result.success) throw toRouteError(result.error, <MODULO>_ERROR_MESSAGES);` y devuelven `ok(...)`.
7. **Actions**: `if (!result.success) return localizeError(result, <MODULO>_ERROR_MESSAGES);` y devuelven `ok(null, { message })`. La validacion de frontera va en `parseInput(() => ...)`.

### Prohibido

- Construir `{ success: ... }` a mano en cualquier capa: usar `ok` / `fail`.
- Escaleras de `instanceof` de errores de dominio en loaders/actions.
- Devolver `error.message` de un error sin tipar al cliente.
- Declarar tipos de paginacion nuevos: `PaginationMeta` es `{ page, pageSize, total, totalPages }` y no se renombra.
- Duplicar defaults de paginacion entre loader y repositorio: viven en `domain/<modulo>.config.ts`.

Referencia canonica de implementacion: modulo `users` (`app/modules/users/`).

## Restricciones de acoplamiento

No introducir en logica de negocio:

- Tipos de request/response de framework.
- Redirects/routing en servicios de negocio.
- Dependencias a SDKs/ORM (Prisma) fuera de application/, infrastructure/ o adaptadores en app/shared/.

## Inyeccion de dependencias (estrictamente obligatoria)

**Esta prohibido resolver una dependencia con estado por import directo.** El proyecto usa
Awilix en modo `PROXY` con un contenedor por peticion (`app/shared/di/container.server.ts`),
tipado por el registry `ICradle` (`app/shared/di/container.types.ts`) y expuesto a
loaders/actions vias el `context` de React Router (`app/react-router.d.ts`).

### Se resuelve SIEMPRE por el cradle

| Categoria | Ejemplos |
| --- | --- |
| Servicios de aplicacion | `userService`, `authService`, `sessionMonitorService`, `securityStateService`, `tokenService`, `passwordService` |
| Repositorios y adaptadores | `userRepository`, `sessionRepository`, `securityStateRepository` |
| Clientes e infraestructura | `prisma`, `storageProvider`, `rateLimiter`, `singleFlight` |
| Configuracion y transversales | `authConfig`, `logger`, `authPayload`, `env` |

Consecuencias no negociables:

1. Un loader/action **nunca** hace `import { createUserService } from "..."`. Toma el
   servicio de `context.userService`, ya tipado por la augmentation de `RouterContextProvider`.
2. Un servicio de `application/` **nunca** importa su repositorio de `infrastructure/`. Lo
   declara en `type Dependencies = { userRepository: ICradle["userRepository"] }` y lo recibe
   por destructuring en su factory.
3. Toda dependencia nueva se registra en `container.server.ts` y se declara en `ICradle`
   tipada contra el **puerto** de `domain/`, nunca contra la implementacion concreta.
4. La factory devuelve el tipo del puerto (`IUserService`, `AuthService`, `IUserRepository`),
   no el objeto literal inferido.
5. Prohibido instanciar una dependencia a mano dentro de un caso de uso (docs/reglas.md §11.4).

### Excepciones permitidas (import estatico directo)

1. Tipos e interfaces (`import type`): no existen en runtime, no son inyectables.
2. Componentes de UI, hooks y utilidades de vista (botones, inputs, hooks de React Router).
3. Helpers puros y sin estado de `app/shared/` (`ok`, `fail`, `parseInput`,
   `createOperationRunner`, `toPaginationMeta`) y piezas puras de `domain/` del propio modulo
   (reglas, mappers, validadores, clases de error, constantes de `<modulo>.config.ts`).
4. Librerias de terceros, dentro de la capa que les corresponde (`valibot`, `jose`,
   `bcryptjs`; tipos del ORM solo en `infrastructure/`).

### Criterio de desempate

Si tiene estado, ciclo de vida, I/O, o hay que sustituirlo por un doble en un test: **se
inyecta**. Si es una funcion pura, un tipo o una constante: se importa.

## Sufijo .server obligatorio

Todo archivo que solo deba ejecutarse en el servidor debe terminar en `.server.ts` (o `.server.tsx` si aplica), siguiendo la convencion de React Router/Vite para excluirlo del bundle de cliente. Aplica siempre que el archivo:

- Acceda a la base de datos (Prisma Client) directa o indirectamente.
- Lea variables de entorno o secretos.
- Maneje sesiones, cookies o hashing de contraseñas.
- Use SDKs de almacenamiento en la nube (S3, GCS) u otras credenciales de proveedor.
- Dependa de APIs de Node no seguras para el bundle de cliente.

Consecuencias practicas por capa:

1. `application/` e `infrastructure/` de cada modulo son siempre server-only: sus archivos deben llevar `.server.ts` (ej. `auth.service.server.ts`, `session.repository.server.ts`).
2. `domain/` debe mantenerse agnostico a I/O; si un archivo de domain/ necesitara el sufijo `.server`, es señal de que rompio la capa y su logica pertenece a application/ o infrastructure/.
3. En app/core/ y app/shared/, cualquier archivo con las condiciones anteriores lleva el sufijo aunque no pertenezca a un modulo (ej. app/core/db.server.ts, app/core/env.server.ts, app/shared/di/container.server.ts, app/shared/auth/require-auth.server.ts).
4. app/lib/ y los componentes de UI en app/shared/components/ deben permanecer libres de imports server-only.

## Ubicacion obligatoria de pruebas

**Prohibido que un archivo `.test.ts` conviva en el mismo directorio que el archivo que
prueba.** Todo test vive en una carpeta `__tests__/` dentro del directorio de la capa a la
que pertenece el archivo bajo prueba:

```
app/modules/users/
├── domain/
│   ├── user.rules.ts
│   └── __tests__/
│       └── user.rules.test.ts
├── application/
│   ├── users.service.server.ts
│   └── __tests__/
│       └── users.service.server.test.ts
└── infrastructure/
    ├── users.repository.server.ts
    └── __tests__/
        └── users.repository.server.test.ts
```

Reglas:

1. Un `__tests__/` **por capa** (`domain/`, `application/`, `infrastructure/`, `utils/`), no
   uno solo por modulo. Aplica igual en `app/shared/`.
2. El nombre del test conserva el nombre completo del archivo bajo prueba, incluido el sufijo
   `.server`: `application/__tests__/users.service.server.test.ts`.
3. Los archivos dentro de `__tests__/` **no** llevan sufijo `.server` propio aunque prueben
   archivos que si lo tengan: nunca entran al bundle.
4. `vitest.config.ts` solo descubre `app/**/__tests__/**/*.test.{ts,tsx}`. Un test mal ubicado
   no se ejecuta y por tanto no protege nada — la convencion falla de forma visible.
5. Los imports dentro del test usan `../` para el archivo bajo prueba y `../../` para cruzar a
   otra capa del mismo modulo; el alias `@/` no cambia.

## Cobertura obligatoria por modulo

Todo modulo debe incluir pruebas de las funcionalidades que implementa. Es **obligatorio sin
excepcion** para toda operacion que genere mutaciones en la base de datos: create, update,
delete, archive/restore, y cualquier mutacion de estado de seguridad (revocacion por epoch,
lockdown, cierre de sesiones).

Minimo exigible por cada operacion mutadora:

1. Un test en `application/__tests__/` del caso de uso, con el repositorio como doble, que
   verifique el envelope `AppResponse<T>` tanto en exito como en fallo.
2. Un test en `domain/__tests__/` de las reglas que gobiernan la mutacion: validaciones,
   invariantes y transiciones de estado.
3. Un test del error tipado que la operacion puede lanzar, comprobando su `code` estable —
   **nunca** comparando el `message`, que es texto traducible de UI.

Reglas de construccion:

- Los dobles se arman a mano y se castean a la clave del cradle
  (`as unknown as ICradle["userRepository"]`), incluyendo solo los metodos que la operacion
  bajo prueba realmente toca. **Prohibido** un doble completo del cradle: esconde que depende
  de que.
- Ninguna prueba de `domain/` o `application/` levanta el framework (docs/reglas.md §12).
- Un PR que agrega o modifica una operacion mutadora sin su prueba correspondiente no se aprueba.

## Checklist de salida del agente

Antes de terminar una tarea, el agente debe confirmar:

1. Que el cambio cumple docs/reglas.md.
2. Que no se rompio la separacion de responsabilidades por archivo.
3. Que no hay imports de framework en capas de negocio.
4. Que ninguna dependencia con estado (servicio, repositorio, cliente, config, logger) se resolvio por import directo: todas vienen del cradle y estan declaradas en `ICradle`.
5. Que los archivos server-only (DB/Prisma, secretos, sesiones, storage) usan el sufijo `.server.ts`.
6. Que se agregaron o actualizaron las pruebas necesarias, que viven en `__tests__/` de su capa, y que toda operacion mutadora nueva o modificada tiene la suya.
7. Que la documentacion tecnica fue actualizada si hubo cambios estructurales.
8. Que todo servicio nuevo o modificado devuelve `AppResponse<T>` y sus loaders/actions lo consumen sin `instanceof` ni literales `{ success: ... }`.

## Regla de decision

Si el usuario pide una implementacion que rompe estas reglas, el agente debe:

1. Señalar el impacto de mantenimiento/migracion.
2. Proponer alternativa alineada al estandar.
3. Ejecutar la opcion solicitada solo con confirmacion explicita del usuario.

## Regla de git hooks

**Prohibido** usar `--no-verify` en commits o push. Si un hook falla, el agente debe:

1. Leer el error y entender la causa.
2. Corregir el problema (formato, lint, tipos, tests).
3. Si el error es preexistente y no introducido por el cambio actual, corregirlo de todos modos antes de commitear.
4. Solo si el usuario lo autoriza explícitamente, se puede omitir el hook.

Los hooks del proyecto (Husky, `.husky/`) ejecutan:

- `pre-commit`: `bun run verify:commit` (lint-staged: Biome sobre los archivos en stage, con auto-fix y re-stage; luego typecheck del proyecto completo).
- `commit-msg`: `commitlint` sobre el mensaje (Conventional Commits, ver `.commitlintrc.json`).
- `pre-push`: `bun run verify:push` (suite completa con `vitest run`).

## Flujo de migraciones Prisma (a prueba de conflictos en equipo)

### Configuracion

El proyecto define `prisma.config.ts` en la raiz, apuntando a `schema: "prisma/schema.prisma"` y `migrations.path: "prisma/migrations"`. A diferencia de Drizzle, Prisma ya nombra cada carpeta de migracion con timestamp por defecto (ej: `20260611163000_add_users_table/`), por lo que no requiere configuracion adicional para evitar conflictos de numeracion secuencial entre ramas paralelas.

### Comandos

| Comando                              | Uso                                                          |
| ------------------------------------- | ------------------------------------------------------------ |
| `bunx prisma migrate dev --name x`    | Genera y aplica una migracion SQL desde cambios en schema.prisma (desarrollo local) |
| `bunx prisma migrate deploy`          | Aplica migraciones pendientes en un entorno (CI/produccion) |
| `bunx prisma migrate status`          | Verifica consistencia entre `prisma/migrations/` y el historial aplicado en DB |
| `bunx prisma db push`                 | Empuja schema directo a DB sin generar migracion (solo desarrollo local) |
| `bunx prisma studio`                  | Abre Prisma Studio para explorar la DB                       |
| `bunx prisma generate`                | Regenera el Prisma Client tras cambios en schema.prisma      |
| `bun run seed`                        | Corre `prisma/seed.ts`                                       |

### Flujo correcto al modificar schema

1. Modificar `prisma/schema.prisma` con los cambios necesarios.
2. Ejecutar `bunx prisma migrate dev --name <descripcion>` — genera una migracion con timestamp unico y la aplica localmente.
3. Revisar el `migration.sql` generado en `prisma/migrations/<timestamp>_<descripcion>/` para validar que sea correcto.
4. Ejecutar `bunx prisma generate` si el cliente no se regenero automaticamente.
5. Commitear la carpeta de migracion completa (`migration.sql` junto con su carpeta con timestamp).

### Antes de mergear una rama con migraciones

1. Asegurarse de tener la rama objetivo actualizada (`git pull origin main`).
2. Ejecutar `bunx prisma migrate status` — detecta divergencias entre el historial local y `prisma/migrations/` de otras ramas.
3. Si hay conflictos (dos migraciones independientes tocando el mismo schema, o `migrate dev` falla al aplicar):
    - Eliminar las migraciones locales generadas en la rama.
    - Hacer pull/merge de main.
    - Regenerar la migracion con `bunx prisma migrate dev --name <descripcion>`.
    - La nueva migracion tendra un timestamp posterior y sera consistente.

### Reglas no negociables

- **Nunca** renombrar manualmente carpetas o archivos de `prisma/migrations/` para "arreglar" el orden.
- **Nunca** editar `prisma/migrations/migration_lock.toml` ni la tabla `_prisma_migrations` a mano.
- **Nunca** usar `bunx prisma db push` como sustituto de migraciones en ramas que se van a mergear (solo para prototipado local descartable).
- **Siempre** commitear la carpeta completa de la migracion (`migration.sql` + carpeta con timestamp).
- **Siempre** correr `bunx prisma migrate status` antes de mergear si la rama toca `prisma/schema.prisma`.


## Reglas de verificación durante la tarea

### Cuándo NO correr verificaciones
- **No corras `typecheck` tras cambios puramente aditivos**: crear archivos de test,
  escribir `.md`, añadir comentarios, o cualquier cambio que no altere firmas ni types.
- **No corras la suite completa** mientras trabajas en un módulo específico.
  Usa el subconjunto relevante: `bun run test app/modules/<modulo>`.
- **No repitas `test:coverage`** más de una vez por sesión de trabajo, y solo cuando
  el hook de pre-push lo vaya a exigir de todos modos.

### Cuándo SÍ correr verificaciones
| Situación | Comando |
|-----------|---------|
| Cambio que altera firmas, tipos o interfaces | `bun run typecheck` |
| Antes de cada commit (pre-commit obligatorio) | `bun run verify:commit` sobre el stage |
| Antes de push o al cerrar un paso del plan | `bun run test app/modules/<modulo>` |
| Solo justo antes del commit final del paso | Suite completa o `test:coverage` |

### Regla de oro
> Corre la verificación **mínima que confirma que el cambio actual no rompe nada**.
> Deja la suite completa y `typecheck` global para el momento en que el hook
> los va a exigir igualmente. No los uses como señal de progreso.

### Sobre herramientas de edición
- Si un comando supera el límite de longitud del shell, **pártelo en dos** desde el inicio.
  No lo reintentes completo primero.
- Si el JSON de un helper de edición falla, valida la sintaxis antes de reenviar
  (comas sobrantes, escapes de regex).

## Política de comentarios

El código bien escrito se explica solo. Las features se documentan por separado. Los comentarios son un recurso escaso y deben reservarse para lo que el código no puede decir por sí mismo.

### Cuándo SÍ comentar

- **JSDoc en funciones y métodos exportados**: una línea de `/** Descripción */` que aparece al hacer hover. Solo si el nombre de la función no lo deja claro por sí solo.
- **Lógica no obvia**: un bloque con un algoritmo, una condición de borde, o una decisión de negocio cuyo *porqué* no es evidente en el código.
- **Workarounds o limitaciones conocidas**: cuando se hace algo de una forma poco ortodoxa por una razón concreta (bug de librería, restricción del ORM, etc.).

### Cuándo NO comentar

- No parafrasear lo que el código ya dice (`// Recorre el array` encima de un `for`).
- No poner cabeceras de sección inventadas (`// ============ HELPERS ============`).
- No dejar comentarios de "intención futura" (`// TODO mejorar esto después`) sin un ticket real asociado.
- No traducir al español lo que el nombre de la variable o función ya expresa.
- No añadir términos o jerga que solo tiene sentido en el contexto de la sesión del agente.

### Regla de oro

> Si eliminar el comentario no hace el código más difícil de entender, elimínalo.
