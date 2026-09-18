# Arquitectura del Proyecto

## Visión General

Este proyecto combina tres conceptos arquitectónicos para lograr código **organizado, mantenible y escalable**:

- **Hexagonal Architecture (Ports & Adapters)** — separa el núcleo de negocio de los detalles técnicos
- **Screaming Architecture** — la estructura de carpetas grita lo que hace el sistema, no cómo está construido
- **Feature Modules** — cada módulo es autónomo y contiene todo lo que necesita

El resultado es una arquitectura donde **agregar un nuevo módulo es predecible**, cada archivo tiene un lugar obvio, y el dominio de negocio nunca depende de frameworks ni librerías externas.

---

## Funcionalidades implementadas

Más allá de la guía de arquitectura genérica de este documento, esta plantilla ya
trae resueltas las siguientes funcionalidades transversales — listas para
reutilizarse en cualquier proyecto derivado. La documentación técnica completa,
como está implementada, vive en [docs/](./docs/README.md).

### 🔐 Autenticación

Sesiones de doble token (access JWT de 5 min + **refresh token opaco** de 7
días, sin payload, solo hash SHA-256 en reposo) sobre cookies `httpOnly`,
firmadas y `SameSite=Lax`:

- Login con rate limiting (por email y por IP) y verificación timing-safe que
  evita enumeración de usuarios.
- Silent refresh automático e idempotente (single-flight + rotación
  compare-and-swap en DB + ventana de gracia), con detección de reuso de
  tokens (robo de sesión) que revoca todas las sesiones del usuario afectado.
- Logout individual y logout global (todas las sesiones del usuario).
- Cap configurable de sesiones activas por usuario.
- **Monitor de sesiones** (`/dashboard/sesiones`, solo `SUPERADMIN`): listado
  paginado de todas las sesiones activas de la plataforma, con revocación
  puntual (una sesión), por usuario (todas las de una cuenta) o global
  (todas salvo la propia).
- **Epoch de validez** — revocar por usuario o cerrar todas invalida los
  *access tokens ya emitidos*, no solo la renovación: la cuenta queda fuera en
  el TTL de la caché del estado de seguridad (segundos), no en el TTL del
  token (minutos).
- **Lockdown de plataforma** — cierre de emergencia con dos alcances (`all` /
  `except-admin`) que además de revocar lo emitido **bloquea login y refresh**
  mientras dure el incidente; purga de sesiones transaccional, break-glass por
  CLI (`bun run lockdown`) para cuando el propio panel queda bloqueado, y
  banner + confirmación reforzada en la UI.
- Fail-fast de configuración: secretos y TTLs se validan al arrancar el proceso.

Ver [docs/auth/00-sistema-autenticacion.md](./docs/auth/00-sistema-autenticacion.md)
(referencia principal), [docs/auth/02-revocacion-inmediata-epoch.md](./docs/auth/02-revocacion-inmediata-epoch.md)
y [docs/auth/03-lockdown.md](./docs/auth/03-lockdown.md).

### 🛡️ Autorización por rol (RBAC) y enrutado

- Gate estructural de autenticación a nivel de `layout()` de React Router.
- `requireRole` como único punto de decisión de autorización — responde
  **403** (no un redirect) cuando el usuario está autenticado pero le falta el
  rol requerido, conservando la URL intentada.
- Navegación declarativa filtrada por rol y guards de UI (`useRole`,
  `<RoleGuard>`) — son solo UX; la autorización real vive siempre en el
  servidor.
- Roles centralizados en un único picklist (`shared/rules/atoms.rules.ts`),
  sin jerarquía de roles (deliberado).

Ver [docs/routing/00-sistema-enrutado.md](./docs/routing/00-sistema-enrutado.md).

### 👤 Gestión de usuarios

CRUD completo tras `requireScope(USER_MANAGER_ROLES)`, en `/usuarios`, recortado por el alcance de cada rol:

- Listado paginado y filtrable, alta, edición y reseteo administrativo de
  contraseña (no exige la anterior).
- Soft-delete (`archive`/`unarchive`) y borrado permanente, que solo procede
  sobre una cuenta ya archivada y sin relaciones.
- Foto de perfil: valida el archivo, lo sube al proveedor de almacenamiento
  configurado y persiste la referencia — mismo puerto que el resto de
  `storage/`.

### 🗂️ Almacenamiento de objetos (S3 / GCS)

Puerto `IStorageProvider` en dominio con dos adaptadores intercambiables por
variable de entorno (`STORAGE_PROVIDER`): S3 (y compatibles — MinIO, R2,
Spaces) y Google Cloud Storage:

- Proxy de lectura/escritura con autorización por prefijo, colgado de
  `requireAuth` / `requireRole`.
- Referencias estables persistidas en BD (nunca la URL del proveedor), así
  cambiar de proveedor no invalida lo ya guardado.
- Validación de subida (allowlist de tipo MIME y tamaño) antes de tocar el
  proveedor.
- El proveedor es un singleton de proceso: el cliente del SDK se construye una
  sola vez, no por petición.

Ver [docs/storage/00-sistema-almacenamiento.md](./docs/storage/00-sistema-almacenamiento.md).

### 🔎 Filtros con notación de brackets (estilo Strapi) y paginación

Todo listado filtrable de la plataforma habla **la misma gramática de query
string**, al estilo de Strapi v4: `filters[campo][$operador]=valor`. Por eso vive
en `app/shared/query/` y no dentro de un módulo — un listado nuevo la reutiliza
declarando únicamente su allowlist de campos.

```http
GET /dashboard/usuarios
  ?filters[role][$eq]=SUPERADMIN
  &filters[createdAt][$gte]=2026-01-01
  &filters[$or][0][firstName][$contains]=ana
  &filters[$or][1][lastName][$contains]=ana
  &pagination[page]=2
  &pagination[pageSize]=25
  &sort=createdAt:desc
```

- Las hojas de primer nivel se combinan **con AND**; un `$or` explícito viaja
  como grupo indexado (`filters[$or][0]…`, `filters[$or][1]…`).
- Las relaciones se anidan por tramos: `filters[role][slug][$eq]=admin` se lee
  como el campo `role.slug`. Una clave que empieza por `$` es un operador;
  cualquier otra es un tramo de la ruta.
- Atajo: `filters[year]=2026` equivale a `filters[year][$eq]=2026`.
- Operadores: `$eq`, `$ne`, `$lt`, `$lte`, `$gt`, `$gte`, `$in`, `$notIn`,
  `$contains`, `$notContains`, `$startsWith`, `$endsWith`, `$between`, `$null`,
  `$notNull`, más los lógicos `$and` y `$or`. La coma solo separa en los
  operadores de lista (`$in`, `$notIn`, `$between`); en `$contains` es texto que
  alguien tecleó. Para valores que llevan comas está la forma indexada:
  `filters[bodyType][$in][0]=SUV&filters[bodyType][$in][1]=PICKUP`.
- **La seguridad está en la allowlist de cada módulo, no en el parser.** El
  parser es deliberadamente permisivo y **nunca lanza**: un campo no declarado,
  un operador fuera de su lista o un valor que no pasa su esquema se **descartan
  en silencio**. Estas URLs se comparten recortadas y las recorren bots, así que
  un parámetro inventado degrada a "ese filtro no se aplica", nunca a un error
  de página.
- Los nombres públicos no tienen por qué ser los de las columnas: un módulo puede
  exponer `precio` sobre una columna `priceCents` y recibirlo **en pesos**, porque
  `filters[precio][$lte]=400000` se lee, se comparte y se teclea; `40000000` no.

**Cómo se envía la paginación.** Va en su propia clave, también con brackets, y
el orden en `sort` con la forma `campo:asc|desc` (varios campos separados por
coma o indexados):

```http
?pagination[page]=2&pagination[pageSize]=25&sort=price:asc,year:desc
```

- `page` empieza en **1**. Si falta —o no es un entero positivo— se aplican los
  valores por defecto que declara el módulo en su `*_LIST_DEFAULTS`.
- `pageSize` está acotado por un **tope duro** (`maxPageSize`, con techo de 100
  en `basePaginationSchema`): la URL no puede pedir la tabla entera.
- Solo se ordena por campos marcados `sortable` en la allowlist — ordenar por una
  columna sin índice es justo la consulta que nadie pidió.

La respuesta devuelve el conteo en el envelope estándar, bajo `pagination`:

```jsonc
{
  "success": true,
  "data": [ /* … */ ],
  "pagination": { "page": 2, "pageSize": 25, "total": 138, "totalPages": 6 },
  "timestamp": "2026-08-29T12:00:00.000Z"
}
```

En el servidor son dos pasos separados a propósito: `parseQuery` (forma y
significado, sin confiar en nada) y `validateQuery` (la frontera de confianza,
contra la allowlist). En el cliente, el hook `useBracketFilters` construye ese
mismo query string sin escribir brackets a mano, y `toCanonicalParams` emite la
URL canónica quitando lo que ya es el valor por defecto (`?pagination[page]=1` y
la URL limpia serían si no dos direcciones con el mismo contenido).

### 🎨 Temas y modo oscuro

La regla que gobierna la feature: **el tema es de la plataforma; el modo es de la
persona.** El `SUPERADMIN` define la marca; cada usuario elige su comodidad.

- **Modo claro / oscuro / sistema por usuario**, persistido en cookie `httpOnly`
  y en la cuenta (la cookie manda, porque es lo único disponible para una
  petición anónima; la columna existe para que la preferencia siga al usuario a
  otro dispositivo).
- **Sin flash y sin JavaScript**: el servidor resuelve el modo y emite los tokens
  ya serializados en un `<style>` del `<head>`. En modo `sistema` emite ambas
  variantes tras un `@media (prefers-color-scheme)`, así que la app sigue el
  cambio del sistema operativo **en vivo, sin recargar**. Funciona con JS
  deshabilitado.
- **Theme builder** (`/dashboard/personalizacion`, solo `SUPERADMIN`): biblioteca de
  temas con **borrador y publicado separados** y un único tema activo garantizado
  por construcción (una fila, una FK). Edición de los 36 colores de shadcn en
  ambas variantes más tipografía, radios, bordes, sombras y espaciado.
- **Preview en vivo sobre el documento entero** —el sidebar y la cabecera cambian
  mientras se mueve el slider, no solo una caja de muestra— y **"probar en toda
  la app"** antes de publicar, con el borrador puesto mientras se navega. El
  gate del preview es el rol verificado en servidor, nunca la cookie.
- **Panel de contraste WCAG** de cada par fondo/texto, con aviso no bloqueante:
  informa antes de publicar, pero el admin manda.
- **Interoperable con [tweakcn](https://tweakcn.com)** y con el generador de
  shadcn: pegar un tema en CSS, exportarlo, e import/export en JSON versionado
  (con test de round-trip). Presets de fábrica inmutables que se clonan — la red
  de seguridad para volver cuando un tema publicado sale mal.
- **Fuentes auto-hospedadas** (`@fontsource`) de un catálogo curado de 13
  familias, más las pilas del sistema: ninguna petición a Google en runtime, y
  por tanto ningún tercero en la ruta crítica del render ni fuga de IPs de
  usuarios.
- El tema activo se lee en toda petición, así que va **cacheado en memoria de
  proceso** (mismo patrón que el estado de seguridad). Si la base no responde se
  sirve el tema base: el tema no es una decisión de seguridad, así que aquí el
  modo de fallo correcto es degradar, no denegar.

> Requiere `bunx prisma db push` y `bun run seed` en cada entorno para crear las
> tablas de temas y sembrar los presets de fábrica.

Ver [docs/theme/00-modo-oscuro.md](./docs/theme/00-modo-oscuro.md) y
[docs/theme/01-theme-builder.md](./docs/theme/01-theme-builder.md).

### 🧹 Calidad de código y automatización

- **[Biome](https://biomejs.dev/)** como linter y formateador único (reemplaza
  ESLint + Prettier): reglas en `biome.json`, indentación con tabs, `lineEnding: "lf"`.
- **[Husky](https://typicode.github.io/husky/)** con tres hooks de Git:
  - `pre-commit` → `bun run verify:commit` (`lint-staged` + `typecheck`) sobre
    lo staged.
  - `commit-msg` → `commitlint` valida que el mensaje siga Conventional Commits.
  - `pre-push` → `bun run verify:push` (`bun test`) antes de subir cualquier
    rama.
- **`.gitattributes`** normaliza los saltos de línea a LF en el working tree
  (`* text=auto eol=lf`), para que Windows (`core.autocrlf`) y Unix trabajen
  sobre el mismo byte a byte y Biome no marque falsos positivos por CRLF; los
  binarios (imágenes, fuentes, assets del mapa offline) se excluyen
  explícitamente de esa normalización.

---

## Estructura de Carpetas

```
src/
├── modules/
│   └── [nombre-modulo]/
│       ├── domain/
│       │   ├── [entity].types.ts
│       │   ├── [entity].rules.ts
│       │   ├── [entity].validators.ts
│       │   ├── [entity].mapper.ts
│       │   └── [entity].repository.ts
│       │
│       ├── application/
│       │   └── [entity].service.ts
│       │
│       ├── infrastructure/
│       │   └── [entity].repository.impl.ts
│       │
│       ├── components/
│       ├── hooks/
│       │
│       └── routes/
│           └── [recurso]/
│               ├── index.tsx
│               ├── index.loader.ts
│               ├── index.action.ts
│               └── [sub-ruta]/
│                   └── ...
│
├── shared/
│   ├── ui/
│   ├── hooks/
│   ├── utils/
│   ├── query/                  # filtros con brackets, paginación y sort
│   ├── rules/
│   │   └── list.rules.ts
│   ├── types/
│   │   └── response.types.ts
│   └── container.ts
│
└── routes.ts
```

---

## Las Capas y Sus Responsabilidades

### `domain/` — El núcleo del módulo

Es la capa más importante y la más estable. **No depende de nada externo** — ni de Prisma, ni de React Router, ni de Valibot (solo lo usa para definir contratos, no para lógica de framework).

Todo lo que define *qué es* el módulo y *qué reglas tiene* vive aquí.

#### `[entity].types.ts` — Entidades y DTOs

Define las entidades del dominio y los DTOs (Data Transfer Objects) inferidos desde los schemas de Valibot.

```ts
// domain/user.types.ts
import * as v from 'valibot'
import { userSchema, safeUserSchema, createUserRule, updateUserRule, listUsersRule } from './user.rules'

// ── Entidades ─────────────────────────────────────────
// Espejo fiel del modelo de base de datos
export type User     = v.InferOutput<typeof userSchema>
export type SafeUser = v.InferOutput<typeof safeUserSchema> // sin password

// ── DTOs ─────────────────────────────────────────────
// Lo que cada operación acepta como entrada
export type CreateUserDto = v.InferInput<typeof createUserRule>
export type UpdateUserDto = v.InferInput<typeof updateUserRule>
export type ListUsersDto  = v.InferInput<typeof listUsersRule>
```

Los DTOs se infieren directamente desde los schemas de Valibot para que **tipos y validaciones nunca se desincronicen**. Si cambia una regla, el tipo cambia automáticamente.

#### `[entity].rules.ts` — Schemas de Valibot

Define los schemas de validación. Es la **única fuente de verdad** sobre qué forma tienen los datos que entran y salen del módulo.

```ts
// domain/user.rules.ts
import * as v from 'valibot'
import { createListRule } from '@/shared/rules/list.rules'

// Campos atómicos reutilizables
const email    = v.pipe(v.string(), v.email(), v.transform(val => val.toLowerCase().trim()))
const password = v.pipe(v.string(), v.minLength(8))

// Schema completo de la entidad
export const userSchema = v.object({
  id: v.number(), email, password: v.nullable(v.string()),
  firstName: v.nullable(v.string()), /* ... */
})

// SafeUser: omit de valibot garantiza que la forma es correcta en runtime
export const safeUserSchema = v.omit(userSchema, ['password'])

// Reglas por operación
export const createUserRule = v.object({ email, password, firstName: v.optional(v.string()) })
export const updateUserRule = v.partial(v.omit(createUserRule, ['password']))

// Lista extiende la paginación genérica de shared
export const listUsersRule  = createListRule({ role: v.optional(v.picklist(ROLES)) })
```

Los **campos atómicos** (`email`, `password`) se reutilizan entre rules sin forzar herencia de schemas completos. Esto permite que cada rule sea explícita e independiente.

#### `[entity].validators.ts` — Funciones de validación

Encapsulan el `parse()` de Valibot. Son las únicas funciones que ejecutan validación y **solo las usan los loaders y actions**.

```ts
// domain/user.validators.ts
import * as v from 'valibot'
import { userRules } from './user.rules'

export const validateCreateUser = (data: unknown) => v.parse(userRules.create, data)
export const validateUpdateUser = (data: unknown) => v.parse(userRules.update, data)
export const validateListUsers  = (data: unknown) => v.parse(userRules.list, data)
```

#### `[entity].mapper.ts` — Traducción a entidad de dominio

Convierte datos crudos (Prisma, APIs externas) a la entidad del dominio. Es la **frontera entre infraestructura y dominio**.

```ts
// domain/user.mapper.ts
import * as v from 'valibot'
import { safeUserSchema } from './user.rules'
import type { SafeUser } from './user.types'

export const toDomain = (raw: Record<string, unknown>): SafeUser => {
  const { password: _, ...rest } = raw
  return v.parse(safeUserSchema, rest) // valida en runtime que la forma es correcta
}
```

Usar `v.parse` aquí (en lugar de solo un cast de TypeScript) da seguridad en runtime: si Prisma devuelve algo inesperado, se atrapa aquí antes de propagarse.

#### `[entity].repository.ts` — Puerto (interfaz del repositorio)

Define el **contrato** que debe cumplir cualquier implementación del repositorio. Es un puerto hexagonal: el dominio no sabe si los datos vienen de Prisma, de una API REST o de un mock.

```ts
// domain/user.repository.ts
import type { SafeUser } from './user.types'
import type { CreateUserDto, UpdateUserDto, ListUsersDto } from './user.types'

export interface UserRepository {
  findAll(filters: ListUsersDto): Promise<SafeUser[]>
  findById(documentId: string): Promise<SafeUser | null>
  create(dto: CreateUserDto): Promise<SafeUser>
  update(documentId: string, dto: UpdateUserDto): Promise<SafeUser>
  delete(documentId: string): Promise<void>
}
```

---

### `application/` — Casos de uso

Contiene **únicamente los casos de uso**. Orquesta el dominio para cumplir una operación de negocio. No sabe nada de HTTP, Prisma o React Router.

```ts
// application/user.service.ts
import type { UserRepository } from '../domain/user.repository'
import type { CreateUserDto, SafeUser } from '../domain/user.types'

type Dependencies = { userRepository: UserRepository }

export const createUserService = ({ userRepository }: Dependencies) => {

  const create = async (dto: CreateUserDto): Promise<SafeUser> => {
    const hashed = await hashPassword(dto.password)
    return userRepository.create({ ...dto, password: hashed })
  }

  const findAll = (filters: ListUsersDto) => userRepository.findAll(filters)

  return { create, findAll /* ... */ }
}

export type UserService = ReturnType<typeof createUserService>
```

Se usa el patrón **closure** en lugar de clases para mantener el paradigma funcional. Las dependencias se inyectan como parámetros del factory, compatible con Awilix.

---

### `infrastructure/` — Adaptadores externos

Implementa los puertos definidos en `domain/`. Es la única capa que conoce Prisma, fetch, o cualquier librería de acceso a datos. **El modelo de Prisma nunca cruza esta frontera** — siempre se convierte a entidad de dominio antes de retornar.

```ts
// infrastructure/user.repository.impl.ts
import type { PrismaClient } from '@prisma/client'
import { toDomain } from '../domain/user.mapper'
import type { UserRepository } from '../domain/user.repository'

type Dependencies = { prisma: PrismaClient }

export const createUserRepository = ({ prisma }: Dependencies): UserRepository => {

  const create = async (dto: CreateUserDto) => {
    const user = await prisma.user.create({ data: dto })
    return toDomain(user) // PrismaUser → SafeUser aquí mismo, nunca sale de esta capa
  }

  const findAll = async (filters: ListUsersDto) => {
    const users = await prisma.user.findMany({ /* ... */ })
    return users.map(toDomain)
  }

  return { create, findAll /* ... */ }
}
```

---

### `routes/` — Entry points (Loaders y Actions)

Son los **adaptadores de entrada** de la arquitectura hexagonal. Reciben requests de React Router, validan con los validators del dominio, y llaman al servicio. No contienen lógica de negocio.

```
routes/
└── users/
    ├── index.tsx              # Página principal de listado
    ├── index.loader.ts        # Carga datos para index.tsx
    ├── crear/
    │   ├── index.tsx          # Formulario de creación
    │   └── index.action.ts    # Procesa el submit del formulario
    └── [id]/
        ├── index.tsx          # Detalle de un usuario
        └── index.loader.ts    # Carga datos del usuario por id
```

```ts
// routes/users/crear/index.action.ts
import { validateCreateUser } from '../../../domain/user.validators'
import { container } from '@/shared/container'

export async function action({ request }: ActionFunctionArgs) {
  const body    = await request.json()
  const dto     = validateCreateUser(body)           // unknown → CreateUserDto
  const service = container.resolve('userService')
  return service.create(dto)
}
```

```ts
// routes/users/index.loader.ts
import { validateListUsers } from '../../domain/user.validators'
import { container } from '@/shared/container'

export async function loader({ request }: LoaderFunctionArgs) {
  const url     = new URL(request.url)
  const filters = validateListUsers(Object.fromEntries(url.searchParams))
  const service = container.resolve('userService')
  return service.findAll(filters)
}
```

---

### `shared/` — Utilidades transversales

Código que no pertenece a ningún módulo específico pero es usado por todos.

#### `shared/rules/list.rules.ts` — Paginación genérica

Factory que añade `page`, `pageSize` y `search` a cualquier schema de filtros. Cada módulo solo declara sus filtros específicos.

```ts
export const basePaginationSchema = {
  page:     v.optional(v.pipe(v.number(), v.minValue(1))),
  pageSize: v.optional(v.pipe(v.number(), v.maxValue(100))),
  search:   v.optional(v.string()),
}

export const createListRule = <T extends v.ObjectEntries>(domainFilters: T) =>
  v.object({ ...basePaginationSchema, ...domainFilters })
```

#### `shared/response/` — Respuesta estándar (obligatoria)

Toda respuesta de un servicio, loader o action tiene la MISMA forma: una unión discriminada por `success`. Ver `docs/reglas.md` §25 y la sección "Contrato estandar de respuestas" de `AGENTS.md`.

```ts
// Los esquemas viven en shared/rules/response.rules.ts; los tipos se derivan de ellos.
type Ok<T> = { success: true;  data: T; message?: string; pagination?: PaginationMeta; timestamp: string }
type Fail  = { success: false; error: ResponseError; timestamp: string }

type AppResponse<T> = Ok<T> | Fail

type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number }
type ResponseError  = { code: string; message: string
                        fieldErrors?: Record<string,string>; details?: Record<string,unknown> }
```

El servicio devuelve el envelope; el repositorio sigue lanzando errores de dominio y el runner los convierte:

```ts
// application/users.service.server.ts
const run = createOperationRunner(logger.child({ module: 'users' }))

async list(filters) {
  return run('list', async () => {
    const [data, total] = await Promise.all([repo.findAll(filters), repo.count(filters)])
    return ok(data, { pagination: toPaginationMeta({ page, pageSize, total }) })
  })
}
```

El adaptador de entrada no conoce los errores del módulo, solo su código:

```ts
// loader: no hay pantalla que mostrar, corta con el status del diccionario
const result = await context.userService.findById(documentId)
if (!result.success) throw toRouteError(result.error, USER_ERROR_MESSAGES)
return ok({ user: result.data })

// action: la pantalla sigue en pie, responde el fallo traducido
const result = await context.userService.archive(documentId)
if (!result.success) return localizeError(result, USER_ERROR_MESSAGES)
return ok(null, { message: 'Usuario archivado' })
```

El mensaje de un error sin tipar **nunca** viaja al cliente: se registra en el log y se responde `UNEXPECTED_ERROR` genérico.

#### `shared/container.ts` — Inyección de dependencias (Awilix)

Ensambla todas las dependencias del sistema. Es el único lugar donde se conectan interfaces con implementaciones.

```ts
import { createContainer, asFunction, asValue } from 'awilix'

export const container = createContainer()

container.register({
  prisma:         asValue(prisma),
  userRepository: asFunction(createUserRepository).singleton(),
  userService:    asFunction(createUserService).singleton(),
})
```

---

## Flujo de Datos Completo

```
Request (HTTP)
    │
    ▼
routes/action o loader
    │  validateXxxDto(body)  ← usa domain/validators
    │  unknown → XxxDto
    ▼
application/service
    │  lógica de negocio
    │  XxxDto → llama repositorio
    ▼
domain/repository (interfaz)
    │
    ▼
infrastructure/repository.impl
    │  XxxDto → Prisma
    │  PrismaModel → toDomain()  ← usa domain/mapper
    │  PrismaModel → SafeEntity
    ▼
domain/mapper
    │  v.parse(safeEntitySchema, raw)
    │  valida en runtime
    ▼
SafeEntity → sube por todas las capas → Response
```

---

## Flujo de Dependencias

```
domain/         →  nada externo ✅
application/    →  domain ✅
infrastructure/ →  domain ✅
routes/         →  domain + application ✅
shared/         →  nada externo ✅

infrastructure/ →  application ❌ (nunca)
domain/         →  infrastructure ❌ (nunca)
```

La regla es simple: **las flechas siempre apuntan hacia `domain/`**, nunca hacia afuera.

---

## Resumen: Dónde Va Cada Cosa

| Qué | Dónde | Por qué |
|-----|-------|---------|
| Entidades (`User`, `SafeUser`) | `domain/types` | Son el corazón del módulo, sin dependencias |
| DTOs (`CreateUserDto`) | `domain/types` | Se infieren de los rules, mismo archivo |
| Schemas Valibot (`createUserRule`) | `domain/rules` | Fuente de verdad de validaciones |
| Funciones `validate*` | `domain/validators` | Encapsulan el `parse()`, solo para routes |
| Mapper `toDomain` | `domain/mapper` | Frontera entre infra y dominio |
| Interfaz del repositorio | `domain/repository` | Puerto hexagonal, contrato puro |
| Casos de uso | `application/service` | Orquesta dominio, sin detalles técnicos |
| Implementación del repositorio | `infrastructure/` | Adaptador, conoce Prisma |
| Loaders y Actions | `routes/` | Entry points, validan y delegan |
| Paginación genérica | `shared/rules` | Se reutiliza en todos los módulos |
| Respuesta genérica | `shared/types` | Forma estándar de todas las respuestas |
| Contenedor DI | `shared/container` | Único lugar que conecta todo |}

