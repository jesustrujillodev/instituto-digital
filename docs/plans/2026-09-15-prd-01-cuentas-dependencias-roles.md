# PRD-01 · Cuentas, dependencias y roles

**Estado:** ejecutado · 2026-09-15. Las desviaciones respecto a lo escrito aquí
están razonadas en los mensajes de commit y en
`docs/adr/0001-modelo-de-roles-y-alcance-por-dependencia.md`; la referencia viva
del resultado es `docs/dependencies/00-dependencias-y-alcance.md`.
**Origen:** `Instituto Digital de Capacitación - Alcance MVP v1.md` §6.1 y §6.2, con §3 (roles) y §5 (modelo de datos)
**Depende de:** nada. Lo consumen PRD-02 a PRD-08.

## 1. Contexto y objetivo

El repo es la plantilla de concesionaria y se está reconvirtiendo en el Instituto Digital de Capacitación. Este es el primer PRD del MVP y sienta lo que todos los demás dan por hecho: **quién es cada persona, a qué dependencia pertenece y qué puede tocar**.

Hoy la plataforma tiene un RBAC plano de dos roles (`ROLES = ["USER","ADMIN"]`, `app/shared/rules/atoms.rules.ts:34`) y **ninguna noción de pertenencia**: `User` no tiene dependencia y ninguna operación de `users` comprueba a quién pertenece el registro que toca. El instituto necesita justo lo contrario: la dependencia es lo que separa la operación y un titular solo debe ver y administrar a su gente.

Al terminar este PRD la plataforma debe poder: crear dependencias, designar titulares, que cada titular arme su equipo y su padrón, que una persona se cambie de dependencia dejando historial, y que nadie vea ni edite fuera de su alcance.

## 2. Decisiones tomadas con el usuario (2026-09-15)

| Tema | Decisión |
| --- | --- |
| Formato | El PRD es un plan de implementación ejecutable, no solo funcional |
| Plantilla de concesionaria | Aquí solo se documenta el impacto. Retirar `inventory`, `showroom`, `cloud` y `theme` va en un PRD-00 de limpieza |
| Llave BC | **Nada que construir.** Cuando exista será una llamada a la API que provee el Ayuntamiento. Se elimina del alcance la tabla `credencial` y su criterio de aceptación |
| Alta de usuarios | Contraseña temporal entregada por canal privado, como ya funciona. El correo de activación llega con PRD-08 |
| Modelo de roles | Rol escalar en `User` más `User.dependencyId`. Sin tabla de membresías |
| Roles de la plantilla | `ADMIN` y `USER` conviven con los nuevos; la limpieza va en PRD-00 |

Consecuencias directas:

- **No hay recuperación de contraseña autoservicio** en el MVP, porque exige correo. La restablece un administrador con el diálogo que ya existe (`app/modules/users/components/reset-password-dialog.tsx`), que además genera la contraseña y la copia al portapapeles.
- **La convivencia de roles obliga a dos ajustes que no son opcionales** (§10): hoy el lockdown con alcance `except-admin` exime a `["ADMIN"]` y purga `role: { not: "ADMIN" }`. Si los usuarios del instituto no son `ADMIN`, un cierre de plataforma dejaría fuera también al superadministrador que tiene que levantarlo.

## 3. Fuera de alcance

Perfil de capacitador y usuarios externos (PRD-02), grupos (PRD-02), cursos y sesiones (PRD-03), correo transaccional y activación de cuenta (PRD-08), importación masiva de plantilla de personal, autoregistro público, y el retiro de los módulos de concesionaria (PRD-00).

## 4. Impacto sobre lo que ya existe

**Se reutiliza tal cual:** el contrato `AppResponse<T>` con `createOperationRunner` y `DomainError`; el cradle de Awilix; `DataTable`, `columnHelpers`, `PageHeader`, `ConfirmDialog`, `Sheet` + `SheetRowActions`, `FormActions` y los inputs comunes; el patrón de formulario RHF + valibot con la misma regla en cliente y servidor; el soft delete por `archivedAt` con sus intents; `requireAuth`, el gate estructural de `/dashboard` y la mecánica de 403; el diálogo de contraseña.

**Se extiende:** la tupla `ROLES`; el payload del access token; `AuthContext`; el módulo `users` completo; `navigation.config.ts`.

**Se toca lo mínimo para no romper:** los `requireRole(["ADMIN"])` de `inventory`, `showroom`, `cloud` y `theme` se quedan como están — al conservar `ADMIN` en la tupla siguen compilando y pasando sus pruebas. Solo se ajustan los puntos donde el superadministrador quedaría fuera de una función de plataforma: monitor de sesiones, lockdown y el preview de temas de `app/root.tsx:101`.

**Se corrige un hueco de seguridad real:** `archivedAt` no se comprueba en autenticación (§10).

## 5. Roles

Valores en inglés, como el resto de identificadores (`docs/reglas.md` §24). La copia en español vive en `ROLE_LABELS`.

| Valor | Copia | Alcance | Qué hace |
| --- | --- | --- | --- |
| `SUPERADMIN` | Superadministrador | Global | Crea, edita y desactiva dependencias; designa titulares; administra a cualquier usuario |
| `DEPENDENCY_HEAD` | Titular | Su dependencia | Uno por dependencia. Da de alta a su personal, designa y retira auxiliares |
| `DEPENDENCY_DEPUTY` | Auxiliar | Su dependencia | Lo mismo que el titular salvo gestionar auxiliares |
| `USER` | Participante | Lo propio | Rol base. Ve su perfil y se cambia de dependencia |
| `ADMIN` | — | — | Heredado de la plantilla. Sobrevive hasta PRD-00; ningún usuario del instituto lo usa |

`USER` se reutiliza como participante en vez de introducir `PARTICIPANT`: evita un backfill de datos y es el valor por defecto que ya tiene la columna. El rol de capacitador **no** entra en esta tupla: en PRD-02 será un perfil de extensión que se añade encima de cualquiera de estos.

## 6. Modelo de datos

Se añade el schema de Postgres `org` a `datasource.schemas` (`prisma/schema.prisma:13`, hoy `["auth","inventory","public"]`).

```prisma
/// Unidad organizativa que separa la operación de la plataforma.
model Dependency {
  id         Int       @id @default(autoincrement())
  documentId String    @unique @default(uuid()) @db.Uuid
  name       String    @unique
  acronym    String?
  /// Soft delete, misma semántica que User.archivedAt: null = activa.
  archivedAt DateTime? @map("archived_at")
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  users User[]

  @@map("dependencies")
  @@schema("org")
}

/// Historial de cambios de adscripción. Sin aprobaciones ni estados: es bitácora.
model DependencyChange {
  id               Int      @id @default(autoincrement())
  userId           Int      @map("user_id")
  fromDependencyId Int?     @map("from_dependency_id")
  toDependencyId   Int      @map("to_dependency_id")
  /// Quién lo hizo: el propio usuario o un administrador.
  changedById      Int      @map("changed_by_id")
  createdAt        DateTime @default(now())

  @@index([userId, createdAt])
  @@map("dependency_changes")
  @@schema("org")
}
```

En `User` (`prisma/schema.prisma:16-63`) se añade:

```prisma
  /// Interno (personal del Ayuntamiento) o externo. El externo llega en PRD-02
  /// con el capacitador externo; el enum se crea ya para no migrar dos veces.
  type           UserType @default(INTERNAL)
  /// Obligatorio y único para internos. En Postgres un @unique admite varios
  /// NULL, que es exactamente "si se captura, no se repite".
  employeeNumber String?  @unique @map("employee_number")
  jobTitle       String?  @map("job_title")
  /// Restrict, no SetNull: desactivar una dependencia con personal es la vía
  /// prevista; borrarla y dejar huérfanos, no.
  dependencyId   Int?        @map("dependency_id")
  dependency     Dependency? @relation(fields: [dependencyId], references: [id], onDelete: Restrict)

  /// Prefijo de toda consulta con alcance de dependencia.
  @@index([dependencyId, archivedAt])
```

**Lo que Prisma no expresa y va a mano en el `migration.sql`:**

```sql
-- Exactamente un titular por dependencia activa (§6.2), impuesto por la base
-- y no por la aplicación. Prisma no declara índices únicos parciales.
CREATE UNIQUE INDEX users_one_head_per_dependency
  ON auth.users (dependency_id)
  WHERE role = 'DEPENDENCY_HEAD' AND archived_at IS NULL;

-- Coherencia interno/externo. El superadministrador es el único interno al que
-- no se le exige dependencia, porque su alcance es global.
ALTER TABLE auth.users ADD CONSTRAINT users_type_coherence CHECK (
  (type = 'EXTERNAL' AND dependency_id IS NULL AND employee_number IS NULL)
  OR
  (type = 'INTERNAL' AND employee_number IS NOT NULL
     AND (dependency_id IS NOT NULL OR role = 'SUPERADMIN'))
);
```

El `CHECK` exige que las cuentas existentes ya cumplan. La migración crea antes una dependencia `Sin asignar` y asigna a los usuarios de la semilla, todo en el mismo archivo, para que no quede un hueco entre migraciones.

**Migraciones.** Hoy `prisma/migrations/` no existe: la base se construyó con `db push`, aunque `AGENTS.md` prohíbe `db push` en ramas que se mergean. La Fase 0 congela la línea base antes de tocar nada:

```bash
mkdir -p prisma/migrations/00000000000000_init
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_init/migration.sql
bunx prisma migrate resolve --applied 00000000000000_init
```

La ventaja concreta: cuando PRD-00 retire `inventory`, el `DROP TABLE` será una migración revisable y no una divergencia silenciosa.

## 7. Alcance por dependencia

Tres piezas, de dentro hacia fuera.

### 7.1 · El claim

`accessTokenPayloadSchema` (`app/modules/auth/domain/auth.rules.ts:27`) y `AuthContext` (`app/modules/auth/domain/auth.types.ts`) ganan `dependencyId: number | null`. Se construye en el único sitio que firma, `buildPayload` (`app/modules/auth/application/auth.service.server.ts:60-75`), así que login y las dos ramas del refresh quedan cubiertas de una vez.

Va en el token y no se lee por petición porque `role` ya es un claim con el mismo perfil de obsolescencia y la maquinaria de invalidación ya está construida: `revokeUserTokens` pone el epoch por usuario con el reloj de Postgres, `evaluateToken` lo compara contra el `iat` en cada petición con caché de proceso, y el refresh relee al usuario en cada rotación (`auth.service.server.ts:190`), así que el claim se autocura. Resolverlo por petición significaría un `SELECT` a `auth.users` en cada petición autenticada, que es justo lo que el diseño de `docs/auth/02-revocacion-inmediata-epoch.md` se tomó el trabajo de evitar.

**Toda mutación de rol o de dependencia llama a `revokeUserTokens(userId)`.** Es lo que reduce a cero la ventana de obsolescencia. El claim lleva el id interno, como `userId`; `SessionUser` no lo recibe — si una pantalla necesita el nombre de la dependencia, lo pone el loader.

### 7.2 · Las reglas puras

| Pieza | Archivo | Qué contiene |
| --- | --- | --- |
| Vocabulario del alcance | `app/shared/auth/scope.rules.ts` (nuevo, puro) | `AccessScope = {kind:"global"} \| {kind:"dependency";dependencyId:number} \| {kind:"self";userId:number} \| {kind:"none"}` y `resolveScope(auth)` |
| Jerarquía de gestión | `app/modules/users/domain/user.access.rules.ts` (nuevo) | `canManageUser`, `canManageDeputies`, `canAssignRole`, `canChangeOwnDependency`, `roleAfterDependencyChange` |

El archivo aparte para la jerarquía respeta dos cosas: el JSDoc de `atoms.rules.ts:44-49`, que pide que la jerarquía real viva en `modules/users/domain` y no en shared, y el límite de 300 líneas por archivo de `docs/reglas.md` §21 — `user.rules.ts` ya está en 129.

La variante `{kind:"none"}` no es defensiva por gusto: un titular con `dependencyId` nulo (fila a medio migrar) debe traducirse a "no ve nada" y **nunca** a un `where: {}`. `scopeWhere` es un `switch` exhaustivo con comprobación `never`.

### 7.3 · La propagación

El alcance es **un parámetro del repositorio**, no una comprobación posterior. Cambia el puerto `IUserRepository` (`app/modules/users/domain/user.repository.ts`): `findAll`, `count`, `findById`, `update`, `updatePhoto`, `updatePassword`, `archive`, `unarchive` y `delete` reciben `scope`.

`count` incluido: si solo se filtra `findAll`, el total de la paginación cuenta cuentas ajenas y las delata.

El repositorio lo traduce a un `where` extra aprovechando que Prisma admite filtros no únicos junto a la clave única:

```ts
prisma.user.update({ where: { documentId, ...scopeWhere(scope) }, data });
```

Si el usuario existe pero cae fuera del alcance, Prisma lanza P2025, que `translatePrismaError` (`users.repository.server.ts:35`) ya convierte en `UserNotFoundError`. **Fuera de alcance se ve igual que inexistente**, que en seguridad es el resultado correcto: no confirma que el registro exista.

Se pasa como parámetro explícito y no como valor inyectado en el cradle porque así **TypeScript falla en cada call site que lo olvidó** — son seis loaders y actions de `users` — y el hook `pre-commit` corre `typecheck`. Un valor ambiental no da esa garantía y dejaría el servicio inservible desde el seed.

## 8. Módulo nuevo: `app/modules/dependencies/`

Identificadores en inglés, rutas en español. Estructura calcada de `users`, que `AGENTS.md:72` declara canónico.

```
app/modules/dependencies/
├── domain/
│   ├── dependency.types.ts       Dependency, DTOs, envelopes
│   ├── dependency.rules.ts       esquemas valibot, SORT_FIELDS, STATUSES
│   ├── dependency.errors.ts      DEPENDENCY_ERROR_CODES + clases sobre DomainError
│   ├── dependency.validators.ts  validateCreateDependency, …
│   ├── dependency.mapper.ts      toDomain
│   ├── dependency.config.ts      DEPENDENCY_LIST_DEFAULTS { page: 1, pageSize: 10 }
│   ├── dependency.service.ts     puerto IDependencyService
│   ├── dependency.repository.ts  puerto IDependencyRepository
│   └── __tests__/
├── application/  dependencies.service.server.ts   + __tests__/
├── infrastructure/ dependencies.repository.server.ts
├── components/   dependency-form.tsx · dependency-badges.tsx · assign-head-dialog.tsx
├── utils/        dependency-error-messages.ts · parse-dependency-form-data.ts · to-dependency-rows.ts  + __tests__/
└── routes/
    ├── routes.config.ts
    └── dependencias/
        ├── index.tsx · index.loader.ts · index.action.ts          + __tests__/
        ├── nueva/index.tsx · index.loader.ts · index.action.ts    + __tests__/
        └── $documentId.editar/index.tsx · …                       + __tests__/
```

**Casos de uso:** `list`, `findById`, `create`, `update`, `archive`, `unarchive`, `assignHead`.

**Errores tipados:** `DependencyNotFoundError`, `DuplicateDependencyNameError`, `DependencyInactiveError`, `DependencyAlreadyHasHeadError`, `HeadMustBelongToDependencyError`.

`assignHead` es la operación delicada. Es una escritura compuesta, así que va en **transacción explícita** (`docs/reglas.md` §8.1):

1. Validar que el candidato pertenece a esa dependencia y está activo.
2. Degradar al titular actual a `USER`, si lo hay.
3. Promover al candidato a `DEPENDENCY_HEAD`.

En ese orden: al revés, el índice único parcial dispara a mitad de transacción. Fuera del commit, `revokeUserTokens` para **los dos**, para que el cambio de rol corte en el acto.

`archive` no borra nada: pone `archivedAt`. El efecto — "no recibe usuarios ni crea cursos" — lo imponen las reglas de `users` y las de PRD-03.

**Rutas**, todas con `requireRole(request, context, ["SUPERADMIN"])` en loader **y** action:

| URL | Qué es |
| --- | --- |
| `/dashboard/dependencias` | Listado con filtros en la URL, hoja de detalle y acciones de archivar y restaurar |
| `/dashboard/dependencias/nueva` | Alta |
| `/dashboard/dependencias/:documentId/editar` | Edición y designación de titular |

**No hay ruta de "directorio de personal".** El directorio que pide §6.2 *es* `/dashboard/usuarios` visto por un titular: el alcance ya lo filtra. Una segunda lista duplicaría el mismo query con otro guard, que es justo donde se cuelan los fallos de aislamiento.

Se registran en `app/routes.ts` bajo el layout de dashboard y en `navigation.config.ts`. El servicio y el repositorio se registran en `container.server.ts` y se declaran en `ICradle` tipados contra el puerto.

## 9. Cambios en el módulo `users`

**Dominio**

- `user.rules.ts`: `userSchema` gana `type`, `employeeNumber`, `jobTitle` y `dependencyId`; `createUserRule` y `updateUserRule` ganan esos campos, con el número de empleado requerido cuando el tipo es interno; `listUsersRule` gana `dependencyId` y `type`; `USER_SORT_FIELDS` gana `employeeNumber`. `userSchema.role` pasa de `v.string()` (línea 21) a `atoms.role`, que elimina el `as Role` de `build-user-form-defaults.ts:39`.
- `user.access.rules.ts` (nuevo): la jerarquía de §7.2.
- `user.errors.ts`: `DuplicateEmployeeNumberError`, `EmployeeNumberRequiredError`, `DependencyInactiveError`, `HeadCannotLeaveDependencyError`, `ForbiddenScopeError` (para las acciones que sí deben decir "no puedes", como asignar un rol superior; la lectura fuera de alcance sigue siendo "no existe").
- `user.repository.ts` y `user.service.ts`: firmas con `scope`, más `changeDependency` y `listDependencyHistory`.

**Infraestructura** (`users.repository.server.ts`)

- `scopeWhere(scope)` privado y propagado a las nueve operaciones.
- `SEARCHABLE_FIELDS` (línea 23) gana `employeeNumber`.
- `translatePrismaError` (líneas 29-40) **tiene que dejar de asumir que el único índice único es el correo** — su propio comentario lo dice hoy. Hay que leer `error.meta.target` para distinguir el correo del número de empleado y del índice parcial del titular. Sin esto, dar de alta a un segundo titular responde "ese correo ya está registrado".
- `changeDependency`: transacción con el `UPDATE` del usuario y el `INSERT` en `dependency_changes`.

**Aplicación** (`users.service.server.ts`)

- Cada método recibe `scope` y lo reenvía.
- `create` comprueba contra `dependencyRepository` que la dependencia destino exista y esté activa antes de escribir.
- `changeDependency(documentId, toDependencyDocumentId, actor)`: aplica el cambio, degrada el rol de auxiliar a `USER` y revoca los tokens tras el commit.
- `archive` gana `revokeUserTokens(user.id)` y `sessionMonitorService.revokeAllForUser(user.id)`. Sin esto, "un usuario inactivo no puede iniciar sesión" solo se cumpliría al expirar su access token vigente.

**Rutas**

Los seis `requireRole(request, context, ["ADMIN"])` de `routes/usuarios/**` pasan a:

```ts
const { auth, scope } = await requireScope(request, context,
  ["SUPERADMIN", "DEPENDENCY_HEAD", "DEPENDENCY_DEPUTY"]);
```

donde `requireScope` (`app/shared/auth/require-scope.server.ts`, nuevo) hace `requireRole` y `resolveScope` de una sola vez, para que no se pueda acertar el rol y olvidar el alcance. El listado ofrece el filtro por dependencia **solo** cuando el alcance es global; para el resto es redundante y engañoso.

`usuarios/nuevo/index.loader.ts`, que hoy solo devuelve `auth`, carga además el catálogo de dependencias activas: el superadministrador la elige, el titular y el auxiliar la tienen fija en la suya.

**Ruta nueva `/dashboard/perfil`** (§6.1 del alcance), solo con `requireAuth`: datos propios, dependencia, roles, cambio de contraseña propio — `changePasswordRule` ya existe y hoy no la usa ninguna ruta — y **cambio de dependencia sin aprobación**, con su historial. El action lo bloquea si el rol es `DEPENDENCY_HEAD`.

**UI**: `user-form.tsx` gana dependencia (fija y deshabilitada para titular y auxiliar), número de empleado y puesto, y limita el `Select` de rol con `canAssignRole`; `user-badges.tsx:9` absorbe el `ROLE_LABELS` que hoy está duplicado en `usuarios/index.tsx:63`; la columna de dependencia aparece solo para el superadministrador; el historial de adscripción se muestra como sección del `UserDetailsSheet` que ya existe, sin ruta nueva.

## 10. Cambios en `auth` y arreglo de seguridad

**El hueco.** `archivedAt` no se comprueba en ningún punto de autenticación: `performLogin` (`auth.service.server.ts:119-135`) solo valida lockdown y contraseña, y la relectura del refresh (`:190`) tampoco filtra. **Un usuario archivado sigue entrando y renovando su token.** Se arregla en tres puntos:

1. **Login**, *después* del `bcrypt.compare` para no alterar el timing: si está archivado, se registra el motivo real en el log y se devuelve `InvalidCredentialsError`. Un código propio viajaría al cliente y sería un oráculo de enumeración: "esta cuenta existe pero está desactivada".
2. **Refresh, rama de rotación normal**: borra todas las sesiones del usuario y falla con `InvalidSessionError`.
3. **Refresh, rama de gracia**: igual.

Junto con la revocación al archivar (§9), las dos mitades del problema quedan cerradas: las comprobaciones sin la revocación dejan vivo el token en curso, y la revocación sin las comprobaciones deja volver a entrar.

**Ajustes por el rol nuevo.** `EXEMPT_ROLES` (`security-state.rules.ts:31-34`) pasa a eximir `["ADMIN","SUPERADMIN"]` en el alcance `except-admin`, y la purga `role: { not: "ADMIN" }` (`security-state.repository.server.ts:111`) pasa a `notIn: ["ADMIN","SUPERADMIN"]`. El **valor persistido** `"except-admin"` no se renombra: vive en `SecurityState.lockdownScope` y cambiarlo exigiría migrar datos sin ganar nada. El monitor de sesiones (`auth/routes/sesiones/*`) y el preview de temas (`app/root.tsx:101`) aceptan también `SUPERADMIN`.

## 11. Reglas de negocio

1. El número de empleado es obligatorio y único para los usuarios internos.
2. Un usuario archivado no puede iniciar sesión ni renovar su token, y conserva todo su historial.
3. Exactamente un titular por dependencia activa, garantizado por un índice único parcial.
4. El titular y los auxiliares tienen que pertenecer a la dependencia que administran.
5. El cambio de dependencia es inmediato, no requiere aprobación y queda en `dependency_changes` con fecha y autor.
6. Un titular no puede cambiarse de dependencia mientras lo sea: primero el superadministrador designa a otro.
7. Al cambiar de dependencia se pierde el rol de auxiliar de la anterior; inscripciones, créditos e historial se conservan.
8. Una dependencia desactivada no admite usuarios nuevos ni aparece como destino de un cambio, pero conserva su historial.
9. Una dependencia con personal no se puede borrar, solo archivar.
10. Nadie asigna un rol por encima del suyo ni edita a alguien de rango superior.
11. Toda mutación de rol o de dependencia revoca los tokens del afectado.
12. No hay autoregistro. Las altas las hacen el superadministrador, el titular o un auxiliar.

## 12. Criterios de aceptación

1. El superadministrador crea una dependencia, le designa titular, y ese titular entra y ve solo a su personal.
2. Un titular que abre por URL directa el detalle de un usuario de otra dependencia recibe **404**, no el registro: fuera de alcance se ve igual que inexistente.
3. Un titular que abre `/dashboard/dependencias` recibe **403** con `requiredRoles: ["SUPERADMIN"]`: ahí el recurso existe y lo que falta es permiso.
4. El listado de usuarios de un titular no contiene, en ninguna combinación de filtros, personal de otra dependencia, y el total de la paginación tampoco lo cuenta.
5. Un auxiliar da de alta participantes pero no puede convertir a nadie en auxiliar ni en titular.
6. Designar un titular nuevo degrada al anterior, y ambos ven su menú actualizado sin volver a iniciar sesión.
7. Designar un segundo titular en una dependencia que ya tiene falla con su copia propia, no con "ese correo ya está registrado".
8. Un usuario se cambia de dependencia por su cuenta, queda en el historial con fecha y autor, y su alcance ya es el nuevo sin volver a iniciar sesión.
9. Un titular no puede cambiarse de dependencia mientras lo sea.
10. Archivar a un usuario mata su sesión abierta en la siguiente petición y el login le responde "credenciales inválidas".
11. Un lockdown con alcance `except-admin` deja dentro al superadministrador y saca a titulares, auxiliares y participantes.
12. `bun run typecheck`, `bun run test` y `bun run test:coverage` pasan, incluidas las pruebas de los módulos de concesionaria que no se tocaron.

## 13. Pruebas

Cobertura obligatoria por `AGENTS.md` para toda operación que muta la base, en `__tests__/` por capa. Los umbrales de `vitest.config.ts:49-54` son 99 / 98 / **100 de funciones** / 99: una función nueva sin prueba tumba `test:coverage`, así que la prueba se escribe junto al código y no al final. Los repositorios están excluidos de cobertura (`vitest.config.ts:44`), pero las traducciones de error sí se prueban.

| Archivo de prueba | Qué cubre |
| --- | --- |
| `dependencies/domain/__tests__/` | Reglas, validadores, mapper y el `code` estable de cada error |
| `dependencies/application/__tests__/dependencies.service.server.test.ts` | `create`, `update`, `archive`, `unarchive` y `list` con envelope en éxito y fallo; `assignHead` degrada antes de promover, rechaza a quien no pertenece, rechaza dependencia archivada y revoca los tokens de ambos |
| `shared/auth/__tests__/scope.rules.test.ts` | `resolveScope` por rol y, sobre todo, **titular sin dependencia → `{kind:"none"}`**, no global |
| `shared/auth/__tests__/require-scope.server.test.ts` | Sin sesión → redirect; rol insuficiente → 403 con `requiredRoles`; devuelve `auth` y `scope` juntos |
| `users/domain/__tests__/user.access.rules.test.ts` | Titular no gestiona fuera de su dependencia; auxiliar no gestiona auxiliares; titular no se cambia; `roleAfterDependencyChange` degrada al auxiliar |
| `users/application/__tests__/users.service.server.test.ts` | Cada método reenvía el `scope` al repositorio; alta en dependencia archivada; interno sin número de empleado; `changeDependency` escribe historial y revoca; `archive` revoca epoch y sesiones |
| `users/infrastructure/__tests__/` | `translatePrismaError` distingue correo, número de empleado e índice del titular por `meta.target` |
| `auth/application/__tests__/auth.service.login.server.test.ts` | Archivado con contraseña correcta falla con `INVALID_CREDENTIALS` y habiendo llamado igualmente a `compare`; `buildPayload` incluye `dependencyId` |
| `auth/application/__tests__/auth.service.refresh.server.test.ts` | Archivado en rama normal y en rama de gracia |
| `auth/domain/__tests__/security-state.rules.test.ts` | `except-admin` exime a `SUPERADMIN` y bloquea a titular, auxiliar y participante |
| `shared/rules/__tests__/atoms.rules.test.ts` | Actualizar la aserción de la tupla: `SUPERADMIN` ahora sí pasa `atoms.role` |
| `*/routes/**/__tests__/` | Loader y action nuevos o modificados, con el harness de contexto por rol que ya usa `users`, extendido con `dependencyId` |

Los dobles se arman a mano y se castean a la clave del cradle, nunca un doble completo. Al cerrar, actualizar `docs/testing/00-inventario-tests.md`.

## 14. Semilla

`prisma/seed-organization.ts`, llamado desde `prisma/seed.ts` antes de los usuarios: dos dependencias activas y una desactivada — para poder probar que una dependencia inactiva no recibe personal —, un superadministrador, y por cada dependencia activa un titular, un auxiliar y dos participantes, todos con número de empleado y puesto. La semilla de concesionaria se queda como está hasta PRD-00.

## 15. Orden de ejecución

| # | Paso | Por qué va aquí |
| --- | --- | --- |
| 1 | Línea base de migraciones | Antes de tocar el schema, o se pierde el punto de partida |
| 2 | Schema, migración, índice parcial y `CHECK` | Todo lo demás compila contra el cliente generado |
| 3 | Tupla `ROLES` y ajustes de lockdown, monitor y navegación | Commit propio y mecánico: el diff se revisa de un vistazo |
| 4 | `scope.rules`, `require-scope`, claim `dependencyId` y `AuthContext` | Ya con los roles definitivos |
| 5 | Módulo `dependencies` completo con sus pruebas | `users` lo necesita para validar la dependencia destino |
| 6 | `users`: dominio → infraestructura → aplicación → rutas → UI | Depende de 4 y 5 |
| 7 | Hueco de `archivedAt` | Aislado y pequeño: commit propio para que el arreglo sea trazable |
| 8 | Semilla y documentación del módulo | Necesita el schema y los roles finales |

Cada paso es un commit que pasa `verify:commit`; los que tocan lógica, también `verify:push`. Sin `--no-verify`.

## 16. Verificación

```bash
bunx prisma migrate status
bun run typecheck
bun run lint
bun run test
bun run test:coverage
bun run seed
bun run dev
```

Recorrido manual, que es el paso 1-2 y 11 del §9 del alcance:

1. Superadministrador: crea dependencias A y B y designa titulares. Designar un segundo titular en A falla con mensaje propio.
2. Titular de A: `/dashboard/usuarios` muestra solo personal de A; `/dashboard/dependencias` da 403.
3. Titular de A da de alta a alguien: el selector de dependencia está fijo en A y sin número de empleado el formulario falla en el campo.
4. Con el `documentId` de un usuario de B, abrir `/dashboard/usuarios/<id>/editar` como titular de A → 404.
5. Titular de A designa auxiliar; el auxiliar entra y no ve la acción de designar auxiliares.
6. Titular de A intenta cambiarse de dependencia en `/dashboard/perfil` → bloqueado con el motivo.
7. Un participante de A se cambia a B: inmediato, con historial, y su alcance pasa a B sin volver a entrar.
8. Archivar a un usuario: su sesión abierta muere y el login le responde "credenciales inválidas".
9. Desactivar una dependencia: dar de alta en ella falla y su historial sigue consultable.
10. Lockdown `except-admin`: el superadministrador sigue dentro, el titular sale.

## 17. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El `CHECK` falla al migrar porque las cuentas existentes no tienen dependencia | La misma migración crea "Sin asignar" y hace el `UPDATE` antes del `ALTER TABLE` |
| Convivir con `ADMIN` deja dos vocabularios y el lockdown `except-admin` sin nadie a quien eximir | Los ajustes de §10 no son opcionales; hay prueba dedicada |
| `translatePrismaError` sigue mapeando todo P2002 al correo | Prueba por cada índice único leyendo `meta.target` |
| Un `scopeWhere` con una rama no cubierta abre la puerta a todo | `switch` exhaustivo con `never`, variante `{kind:"none"}` y prueba dedicada |
| El filtro de alcance junto a la clave única no se comporta como se espera en esta versión de Prisma | Comprobarlo en el primer `update` con alcance antes de propagarlo; alternativa: `updateMany` y verificar que afectó una fila |
| El claim `dependencyId` queda obsoleto si alguna operación futura escribe la dependencia sin revocar | El único sitio que escribe `dependency_id` es `changeDependency`; prueba que verifica la revocación |
| `User.role` es texto libre en la base | Riesgo asumido del MVP: una escritura externa solo se cazaría al firmar el token |
| El rol escalar asume una sola dependencia por persona | Si algún día hace falta tener roles en varias, se migra a tabla de membresías y toca claim, guard y filtros. Hoy el alcance lo prohíbe |

## 18. Documentos que acompañan a este PRD

- **ADR** en `docs/adr/0001-modelo-de-roles-y-alcance-por-dependencia.md`. La carpeta no existe y `docs/reglas.md` §3 y §15.4 la exigen; este es el primer sitio donde hace falta, porque registra el rol escalar, el claim y la condición que obligaría a revisarlos.
- **Referencia del módulo** en `docs/dependencies/00-dependencias-y-alcance.md` al terminar, con la forma de los demás `docs/<modulo>/00-*.md`, y su alta en la tabla de índice de `docs/README.md`.
- **Correcciones al alcance** en `Instituto Digital de Capacitación - Alcance MVP v1.md`, que se escribió antes de estas decisiones:
  - §5 y §6.1: quitar la tabla `credencial`, su arista en el diagrama y la subsección "Preparación para Llave BC"; dejar una línea diciendo que la integración será una llamada a la API que provee el Ayuntamiento.
  - §7: reformular el criterio 8 a "ningún módulo fuera de `auth` valida credenciales", que es lo que de verdad hay que sostener.
  - §6.1: el alta entrega contraseña temporal, no correo de activación, y el restablecimiento lo hace un administrador.
  - §5: reflejar el rol escalar, el índice único parcial del titular y `dependency_changes`, en lugar de `rol_dependencia` y de la solicitud de cambio.
