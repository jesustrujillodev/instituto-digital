# Capacitadores y grupos — Referencia

## 1. Qué es

Dos módulos con **alcances opuestos**, y esa es la razón de que sean dos:

- `app/modules/trainers/` administra el perfil de capacitador, cuya lectura es
  **global**: §4 del alcance quiere que cualquier titular pueda asignar a
  cualquier capacitador activo, sea de su dependencia o no. No tiene pantalla
  propia: el perfil se ve, se filtra y se habilita en `/dashboard/usuarios`
  (ver `docs/adr/0022`).
- `app/modules/groups/` administra las listas nominales de cada dependencia, que
  se recortan por **alcance** como todo lo demás.

Mezclarlos habría dejado un solo repositorio con dos políticas de `where`, que es
donde se cuelan los fallos de aislamiento.

El perfil de capacitador **no es un rol**. Es una extensión de la cuenta que se
suma al rol que ya tenga: §3 del alcance exige que los roles se acumulen —una
misma persona es auxiliar y capacitador a la vez— y `User.role` es escalar. Ver
`docs/adr/0002`.

## 2. El perfil

| Quién | Qué tiene | Qué puede |
| --- | --- | --- |
| **Capacitador interno** | Rol cualquiera + `trainer_profiles` activo | Imparte; desde PRD-03, también crea cursos en su dependencia |
| **Capacitador externo** | `type = EXTERNAL`, sin dependencia, sin número de empleado, perfil **obligatorio** | Solo imparte: no crea cursos, no se inscribe, no acumula créditos |

Decisiones que el schema no dice por sí solo:

- **La PK de `trainer_profiles` ES la FK a la cuenta.** Es lo que garantiza "como
  máximo un perfil por persona" sin índice adicional, y lo que hace que dos
  activaciones simultáneas choquen con P2002 en vez de duplicar.
- **`phone` no se duplica.** §5 del alcance lo listaba en el perfil, pero
  `User.phone` ya existe y dos teléfonos de la misma persona divergen el día que
  alguien actualiza uno.
- **`activo` se llama `archivedAt`**, como en `User` y `Dependency`: el instante
  responde "cuándo se desactivó" sin tabla de auditoría, y desactivar conserva el
  historial de lo impartido.

## 3. El claim `isTrainer`

Viaja firmado en el access token junto a `role` y `dependencyId`. Se arma en
`buildPayload` (`auth.service.server.ts`), el único sitio que firma, así que el
login y las dos ramas del refresh lo heredan sin tocarse.

**No es una columna.** El mapper de `users` lo deriva de la relación:

```
isTrainer = trainerProfile !== null && trainerProfile.archivedAt === null
```

Así la verdad queda en un solo sitio y no hay nada que sincronizar. El precio es
un `LEFT JOIN` sobre una tabla cuya PK es la propia FK, en las tres consultas que
lo necesitan: `findByEmail` (login), `findByInternalId` (refresh) y `findAll` (la
insignia del listado).

**Toda mutación del perfil revoca los tokens del afectado.** Sin eso, activar o
desactivar un perfil tardaría en notarse lo que dure el access token vigente. La
revocación es best-effort: la mutación ya está confirmada y deshacerla sería peor
que una ventana de sesión.

`SessionUser` también lo lleva, a diferencia de `dependencyId`, que PRD-01 dejó
deliberadamente fuera: es un booleano que no identifica nada y la UI lo necesita
para decidir qué pinta.

## 4. Dónde se administra el perfil, y quién

No hay catálogo aparte. El capacitador es un perfil de la cuenta, así que vive en
la tabla de usuarios: una columna, un filtro y tres acciones por fila.

| Acción | Quién |
| --- | --- |
| Ver y filtrar capacitadores | Superadmin, titular y auxiliar, en `/dashboard/usuarios` |
| Habilitar, editar o deshabilitar un perfil | Superadmin, titular y auxiliar, **dentro de su alcance** |
| Registrar capacitadores externos | Superadmin, titular y auxiliar, **sin alcance** |

Un participante con perfil ya no tiene pantalla de consulta: nada de su trabajo
la necesitaba. Asignar capacitadores a un curso usa `findActive()`, que no pasa
por ninguna pantalla.

**El listado de usuarios incluye a los externos.** `listScopeWhere` amplía el
alcance de dependencia con `type = EXTERNAL` solo para la LECTURA de la lista:
el titular tiene que verlos para administrar su perfil. Las escrituras de la
cuenta siguen acotadas por `scopeWriteWhere`, así que sobre un externo el
titular solo ve las acciones del perfil. Filtrar por "Participantes" deja fuera
a los externos: llevan `USER` en la base, pero no cursan.

**Cada fila llega con sus permisos decididos** (`toUserListItems`): `canManage`
para la cuenta y `canManageTrainer` para el perfil. La pantalla oculta lo que el
servidor rechazaría; el action y el servicio lo vuelven a comprobar.

| Ruta | Qué hace |
| --- | --- |
| `/dashboard/usuarios?trainer=yes` | La tabla filtrada a capacitadores activos (`type=EXTERNAL` para los externos) |
| `/dashboard/usuarios/capacitador-externo` | Alta del externo |
| `/dashboard/usuarios/:documentId/perfil-capacitador` | Solo action: `activate`, `update`, `deactivate`, `reactivate` |

La cuenta del action sale de la URL, nunca del formulario. Volver a habilitar no
pide datos: el perfil deshabilitado conserva su especialidad.

**Sobre un externo manda el rol, no el alcance.** No pertenece a ninguna
dependencia, así que `canManageUser` dejaría fuera a cualquier titular. Es lo que
dice la matriz al no acotar esa fila a "su dep.".

## 5. El alta de un externo, la escritura compuesta

Una fila en `auth.users` y otra en `org.trainer_profiles`, **las dos o ninguna**.
Un externo sin perfil violaría §4 del alcance y la base no puede impedirlo
porque el dato que decide está en otra tabla.

```ts
await runInTransaction(async () => {
  const user = await userRepository.create({ …, type: "EXTERNAL" });
  return trainerRepository.create({ userId: user.id, … });
});
```

La transacción es **ambiental**: `prisma` es un `Proxy` que resuelve el cliente
transaccional desde un `AsyncLocalStorage`, así que los dos repositorios entran
sin conocerse y `trainers` no escribe en `auth.users` a mano. Es el primer uso de
`runInTransaction` en el repo y retira la afirmación de `docs/adr/0001` §3 según
la cual una transacción no podía repartirse entre dos repositorios.

La otra mitad de la invariante la sostiene `usersService.create`, que rechaza
`type = "EXTERNAL"` con `EXTERNAL_REQUIRES_TRAINER_PROFILE`: son los dos únicos
caminos que escriben esa columna.

## 6. Grupos: quién los administra

La matriz de §3 marca "Crear y administrar grupos" con `—` para el
superadministrador. Se respeta al pie de la letra para las mutaciones, pero él
**sí lee**: en PRD-03 creará cursos en cualquier dependencia y tendrá que elegir
su audiencia.

```
GROUP_ACCESS_ROLES   → SUPERADMIN, DEPENDENCY_HEAD, DEPENDENCY_DEPUTY   (entran)
canManageGroups      → solo alcance de dependencia                      (escriben)
```

La comprobación efectiva **no es por rol sino por alcance**: un grupo pertenece
forzosamente a una unidad, así que un alcance global no sabría a cuál asignarlo y
uno propio no administra nada. `canManageGroups` es un type guard, de modo que
`scope.dependencyId` está disponible sin cast después de comprobarlo.

La dependencia del grupo **sale del alcance de quien crea, no del formulario**.
Declararla en la regla de entrada permitiría crear un grupo en otra dependencia.

## 7. La regla de los miembros

> Los miembros son usuarios internos y activos **de la dependencia del grupo**.

Se aparta de §6.4 del alcance, que los admitía de cualquier dependencia. Es una
decisión del usuario tomada al planear PRD-02, y tiene dos consecuencias:

- **No hace falta ningún buscador de usuarios sin alcance**, que era el único
  punto del PRD que habría perforado el aislamiento de PRD-01.
- **En PRD-03, un curso restringido a un grupo es un curso restringido a una
  sola dependencia.** Para audiencias mixtas queda el acceso restringido por
  varias dependencias, que §6.5 admite en plural.

La dependencia que decide es la **del grupo**, nunca la del actor:

```ts
where: { dependencyId: group.dependencyId, type: "INTERNAL", archivedAt: null, … }
```

Que hoy coincidan —porque quien administra el grupo pertenece a él— no es motivo
para escribirlo con el alcance del actor: el día que el superadministrador
administre grupos, esa versión abre el padrón entero y esta sigue siendo
correcta.

`addMembers` **rechaza el lote entero** si alguna cuenta no cumple. Dejar dentro
a las válidas y callar el resto convertiría un error en una lista silenciosamente
incompleta. Un externo, un archivado y alguien de otra dependencia caen todos en
la misma comprobación, porque las tres condiciones viven en el mismo `where`.

**Quien cambia de dependencia después no se retira del grupo.** §6.4 evalúa la
pertenencia al ver el curso o al inscribirse, nunca antes, así que la fila no
depende de que la persona siga ahí. La lista lo muestra con su dependencia
ACTUAL: mostrar la de entonces sería inventar un dato que la tabla no guarda.

Evaluarla al usarla significa que **no cuenta mientras la persona esté en otra
dependencia** (`isEffectiveMembership`, `domain/group.access.ts`). Las tres lecturas
que usan la pertenencia aplican esa regla: `findGroupIdsOfUser` (ver un curso
restringido e inscribirse, también por QR), `findGroupParticipants` (invitar al
grupo) y `findGroupEnrollable` (asignar al grupo). Si la persona vuelve a la
dependencia del grupo, su pertenencia vuelve a contar.

`group_members` no tiene soft delete por el mismo motivo: dar de baja a alguien
es un `DELETE`.

## 8. Lo que impone la base, y por qué no la aplicación

```sql
CREATE UNIQUE INDEX groups_name_per_dependency
  ON org.groups (dependency_id, name)
  WHERE archived_at IS NULL;
```

Parcial por el mismo motivo que el índice del titular de PRD-01: un `@@unique` de
Prisma dejaría bloqueado para siempre el nombre de un grupo archivado, y
archivar uno tiene que liberarlo.

Tres invariantes **no** están en la base porque cruzan tablas y un CHECK solo ve
su propia fila: que todo externo tenga perfil, que la institución sea solo del
externo, y que un miembro pertenezca a la dependencia del grupo. Viven en los
caminos de escritura, que están contados y tienen prueba.

## 9. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| Un participante cualquiera administra perfiles | El action del perfil exige `TRAINER_ADMIN_ROLES` |
| Un titular activa el perfil a alguien de otra dependencia | `canManageTrainer` reúne alcance y rango; fuera de alcance responde 404 |
| Un titular edita o archiva la cuenta de un externo | `scopeWriteWhere` no lo alcanza; la fila ni ofrece la acción (`canManage`) |
| Un formulario manipulado cambia a quién se habilita | La cuenta sale del parámetro de la URL, no de un campo |
| Se crea un externo sin perfil de capacitador | Transacción en `createExternal` y rechazo en `usersService.create`: son los dos únicos caminos |
| Dos activaciones simultáneas duplican el perfil | La PK de `trainer_profiles` es la FK: la segunda choca con P2002 |
| Un perfil desactivado sigue dando acceso | La mutación revoca los tokens; `isTrainer` se recalcula al firmar |
| Un titular mete en su grupo a alguien de otra dependencia | El `where` filtra por la dependencia DEL GRUPO, y `addMembers` lo vuelve a comprobar |
| Un alta parcial deja una lista incompleta sin avisar | El lote se rechaza entero si alguna cuenta no cumple |
| El superadministrador edita grupos que no le tocan | `canManageGroups` solo admite alcance de dependencia |
| Un grupo archivado bloquea su nombre para siempre | El índice único es parcial sobre `archived_at IS NULL` |
| Un titular sin dependencia ve o escribe algo | `groupScopeWhere` devuelve un predicado imposible y `groupScopeWriteWhere` devuelve `null` |

## 10. Estadísticas del perfil

Desde PRD-06 el perfil calcula **cursos impartidos** y **valoración promedio**
en `trainers.repository.server.ts`, sin captura:

- impartidos: filas de `course_trainers` cuyo curso está `FINISHED`;
- promedio: la media de TODAS las valoraciones de esos cursos, `null` sin
  valoraciones. No es la media de los promedios por curso.

Una mutación las calcula para una persona (`statsOf`). El listado de usuarios
las pide para toda la página con `findByUserDocumentIds`: dos consultas en total
y no dos por persona, y `toStatsByUser` rehace la media desde sumas y conteos
por curso.

Un curso publicado no cuenta: todavía no se ha impartido y no se puede valorar.
`toDetail` recibe las estadísticas aparte porque no son columnas del perfil.

Desde PRD-03, `ITrainerRepository.findActive()` sirve el selector de
capacitadores del formulario de cursos, y `IGroupRepository.findActive(scope)`
el de audiencia. Los dos son catálogos sin paginar, como
`dependencyRepository.findActive()`.

## 11. Añadir una operación al perfil o a los grupos

1. Decide si es lectura o mutación. En `trainers`, las lecturas **no llevan
   alcance** —las cuentas ya vienen recortadas por el listado de usuarios— y las
   mutaciones reciben el `AuthContext`. En `groups`, las lecturas reciben `scope`
   y las mutaciones el `AuthContext`.
2. Declara la firma en el puerto. TypeScript señalará cada punto que lo olvide.
3. Si toca una cuenta ajena, pásala por `canManageTrainer`; si escribe un grupo,
   por `requireWriteScope`.
4. Si muta el perfil, revoca los tokens del afectado.
5. Escribe la prueba junto al código. La que importa no es el camino feliz: es
   que el action tome la cuenta de la URL, que los candidatos se filtren por la
   dependencia del grupo, y que `none` no se convierta en `{}`.
