# ADR 0002 · Perfil de capacitador y transacción entre módulos

**Estado:** aceptado · 2026-09-15
**Contexto del cambio:** PRD-02 (capacitadores y grupos)

Fija tres decisiones que PRD-03 a PRD-06 dan por hechas y que revisar más tarde
costaría una migración de datos o una reforma de la frontera entre módulos.

## 1. Contexto

PRD-01 dejó resuelto quién es cada persona y a qué dependencia pertenece. El
instituto necesita además saber **quién puede impartir un curso**, y esa
condición no encaja en el modelo de roles que PRD-01 eligió: §3 del alcance
exige que los roles se ACUMULEN —una misma persona es auxiliar y capacitador a
la vez— y `User.role` es escalar.

Aparece también la primera escritura que tiene que tocar dos tablas de módulos
distintos en un solo acto: un capacitador externo es una fila en `auth.users` y
otra en `org.trainer_profiles`, y §4 del alcance exige que existan las dos o
ninguna.

## 2. Decisión

### 2.1 · Extensión 1 a 0..1, no un rol ni una tabla aparte

`TrainerProfile` extiende `User` con la PK igual a la FK. El perfil no entra en
la tupla `ROLES` y no hay una segunda tabla de personas.

**Por qué:** §4 del alcance ya comparó las dos alternativas y eligió esta;
PRD-02 la implementa sin reabrirla. Un rol escalar no admite la acumulación que
§3 exige, y dos tablas separadas partirían el historial de quien es participante
y capacitador a la vez, además de obligar a dos identidades y dos accesos.

Que la PK sea la propia FK no es un detalle de estilo: es lo que garantiza "como
máximo un perfil por persona" sin índice adicional, y lo que hace que dos
activaciones simultáneas choquen con P2002 en vez de duplicar.

**Qué obligaría a revisarlo:** que un capacitador necesite existir sin cuenta en
la plataforma. Hoy no puede: pasa lista, así que inicia sesión.

### 2.2 · `isTrainer` viaja en el access token

`accessTokenPayloadSchema` gana `isTrainer`. No se resuelve por petición.

**Por qué:** es el razonamiento de [0001](./0001-modelo-de-roles-y-alcance-por-dependencia.md)
§2.2 aplicado a un segundo claim con el mismo perfil de obsolescencia. La
maquinaria de invalidación ya está construida y resolverlo por petición costaría
un `SELECT` en cada petición autenticada.

**La contrapartida, y cómo se paga:** toda mutación del perfil revoca los tokens
del afectado. Son cuatro operaciones, todas en un solo servicio, y cada una tiene
prueba de la revocación.

**Dónde vive el dato:** `isTrainer` **no es una columna**. Se deriva en el mapper
de `users` de `trainerProfile !== null && archivedAt === null`. Se prefiere a una
columna denormalizada porque la verdad queda en un solo sitio y no hay nada que
sincronizar; el coste es un `LEFT JOIN` sobre una tabla cuya PK es la propia FK,
en las tres consultas que lo necesitan.

**Qué obligaría a revisarlo:** que ese join se note en el listado de usuarios, o
que aparezca una escritura sobre `trainer_profiles` fuera de su servicio.

### 2.3 · Una transacción SÍ puede repartirse entre dos repositorios

`trainersService.createExternal` envuelve `userRepository.create` y
`trainerRepository.create` en `runInTransaction`. No hay una segunda excepción de
frontera como `assignHead`.

**Por qué:** `app/core/db.server.ts` exporta `runInTransaction`, y el `prisma`
que se registra en el cradle es un `Proxy` que resuelve el cliente transaccional
desde un `AsyncLocalStorage`. Cualquier repositorio que reciba `prisma` por DI
entra en la transacción ambiental sin conocerla. La función estaba escrita y no
la usaba nadie; PRD-02 es su primer consumidor.

Lo que se gana: `trainers` no escribe en `auth.users` a mano — usa el puerto
`IUserRepository` que ya existe — y la frontera entre módulos se mantiene.

**Esto retira una consecuencia de [0001](./0001-modelo-de-roles-y-alcance-por-dependencia.md)
§3.** Aquel ADR afirmaba que "una transacción no puede repartirse entre dos
repositorios" y que `assignHead` era por eso la única excepción posible. La
afirmación era falsa en este repo. `assignHead` se queda como está: reescribirlo
sería un cambio sin beneficio, pero ya no es el único camino disponible.

**Qué obligaría a revisarlo:** que se sustituya el `Proxy` de `db.server.ts` por
un cliente inyectado explícito, o que aparezca un repositorio que resuelva
`prisma` por import directo — ese quedaría fuera de la transacción sin avisar.

## 3. Consecuencias

**Lo que la base impone:**

- `groups_name_per_dependency`, índice único parcial: el nombre de un grupo es
  único entre los activos de su dependencia, y archivar uno libera su nombre.
  Prisma no expresa índices parciales, así que va escrito a mano en la migración.
- La PK de `trainer_profiles` hace de garantía de unicidad del perfil.

**Tres invariantes que la base NO puede imponer**, porque cruzan tablas y un
CHECK solo ve su propia fila:

| Invariante | Dónde vive |
| --- | --- |
| Todo `EXTERNAL` tiene perfil de capacitador | `createExternal` en transacción, y `usersService.create` rechazando `EXTERNAL`. Son los dos únicos caminos que escriben `type` |
| `institution` solo para externos | `trainer.validators.ts`, que recibe el tipo de la cuenta |
| Un miembro pertenece a la dependencia del grupo | El `where` de `listCandidates` y la comprobación de `addMembers` |

Un trigger las cerraría, pero sería la primera lógica de negocio del repo en SQL
y no se podría probar sin base.

**El catálogo de capacitadores es la única lista sin alcance.** §4 del alcance lo
quiere global para que cualquier titular pueda asignar a cualquier capacitador
activo. Se compensa con una proyección corta: nombre, correo, especialidad, tipo,
dependencia e institución — ni estado, ni número de empleado, ni rol.

**El 403 sale de `requireRole`.** Entrar al catálogo no depende solo del rol, así
que hay un guard que no puede delegar en `requireRole` y sí tiene que responder
exactamente lo mismo. `forbiddenRole` es ahora el único sitio que construye esa
respuesta.

**Riesgo asumido:** un miembro que cambia de dependencia después de entrar sigue
en el grupo. Es deliberado y del mismo tipo que "las inscripciones vigentes se
conservan" de §6.1: purgar pertenencias dentro de `changeDependency` borraría
datos por un efecto secundario.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Rol `TRAINER` en la tupla `ROLES` | Rompe la acumulación de roles que exige §3: nadie podría ser auxiliar y capacitador a la vez |
| Tabla de capacitadores separada de `usuario` | §4 del alcance ya la descartó: parte el historial, duplica la identidad y exige dos accesos |
| Columna `User.isTrainer` denormalizada | Ahorra un join sobre una PK a cambio de un dato que hay que sincronizar en cuatro sitios |
| Resolver `isTrainer` por petición | Un `SELECT` en cada petición autenticada, contra el diseño de revocación por epoch |
| Segunda excepción de frontera para `createExternal` | `runInTransaction` ya existía y no la necesita; añadirla normalizaría escribir en tablas ajenas |
| Buscador global de usuarios para los miembros de un grupo | Perforaría el aislamiento de PRD-01. Se restringió el alcance de §6.4 en su lugar |
| Trigger en Postgres para "todo externo tiene perfil" | Primera lógica de negocio en SQL del repo, y no se puede probar sin base |
