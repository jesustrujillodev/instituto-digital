# Capacitadores y grupos — Referencia

## 1. Qué es

Dos módulos con **alcances opuestos**, y esa es la razón de que sean dos:

- `app/modules/trainers/` administra el catálogo de capacitadores, que es
  **global**: §4 del alcance quiere que cualquier titular pueda asignar a
  cualquier capacitador activo, sea de su dependencia o no.
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

## 4. Quién entra al catálogo, y la condición que no es un rol

La matriz de §3 reparte tres permisos distintos:

| Acción | Quién |
| --- | --- |
| Consultar el catálogo | Superadmin, titular, auxiliar **y cualquier capacitador** |
| Activar o desactivar un perfil | Superadmin, titular y auxiliar, **dentro de su alcance** |
| Registrar capacitadores externos | Superadmin, titular y auxiliar, **sin alcance** |

La primera fila es la novedad del módulo: un participante con perfil entra al
catálogo aunque su rol sea `USER`, y `requireRole` no lo expresa porque solo
compara contra la tupla.

Se resolvió extrayendo el 403 a `app/shared/auth/forbidden-role.ts`. El loader
del catálogo hace `requireAuth` + `canViewCatalog(auth)` + `throw forbiddenRole(...)`,
y `requireRole` pasa a usar el mismo helper. Dos `data()` escritos aparte
divergirían y `isForbiddenRoleError` solo reconocería uno.

**Ver el catálogo y modificarlo son dos permisos distintos.** La pantalla es la
misma; las acciones de escritura aparecen solo con `canAdministerTrainers`, y el
action las vuelve a exigir: ocultar un botón no es una regla.

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
| Un participante cualquiera entra al catálogo | `canViewCatalog` exige rol de gestión o perfil activo; el 403 es el mismo que da `requireRole` |
| Un capacitador usa el catálogo para editar perfiles ajenos | El action exige rol: ver y modificar son dos permisos distintos |
| Un titular activa el perfil a alguien de otra dependencia | `canManageTrainer` reúne alcance y rango; fuera de alcance responde 404 |
| El catálogo global expone datos de personal ajeno | Proyección corta: ni estado, ni número de empleado, ni rol |
| Se crea un externo sin perfil de capacitador | Transacción en `createExternal` y rechazo en `usersService.create`: son los dos únicos caminos |
| Dos activaciones simultáneas duplican el perfil | La PK de `trainer_profiles` es la FK: la segunda choca con P2002 |
| Un perfil desactivado sigue dando acceso | La mutación revoca los tokens; `isTrainer` se recalcula al firmar |
| Un titular mete en su grupo a alguien de otra dependencia | El `where` filtra por la dependencia DEL GRUPO, y `addMembers` lo vuelve a comprobar |
| Un alta parcial deja una lista incompleta sin avisar | El lote se rechaza entero si alguna cuenta no cumple |
| El superadministrador edita grupos que no le tocan | `canManageGroups` solo admite alcance de dependencia |
| Un grupo archivado bloquea su nombre para siempre | El índice único es parcial sobre `archived_at IS NULL` |
| Un titular sin dependencia ve o escribe algo | `groupScopeWhere` devuelve un predicado imposible y `groupScopeWriteWhere` devuelve `null` |

## 10. Lo que queda enganchado para PRD-06

La ficha del capacitador ya pinta **cursos impartidos** y **valoración promedio**
con su estado vacío, y el servicio los devuelve desde `TRAINER_STATS_PENDING`
(`0` y `null`) con una prueba que los fija. PRD-06 sustituye el cálculo, no el
contrato ni el sitio donde se muestra.

PRD-03 creó `course_trainers`, pero **los dos contadores llegan juntos en
PRD-06**: "impartido" es un curso finalizado, y nada finaliza cursos hasta
entonces. Calcularlo antes habría mostrado un número real solo en apariencia. El
índice `course_trainers(user_id)` ya existe para ese cálculo.

Desde PRD-03, `ITrainerRepository.findActive()` sirve el selector de
capacitadores del formulario de cursos, y `IGroupRepository.findActive(scope)`
el de audiencia. Los dos son catálogos sin paginar, como
`dependencyRepository.findActive()`.

## 11. Añadir una operación al catálogo o a los grupos

1. Decide si es lectura o mutación. En `trainers`, las lecturas **no llevan
   alcance** y las mutaciones reciben el `AuthContext`. En `groups`, las lecturas
   reciben `scope` y las mutaciones el `AuthContext`.
2. Declara la firma en el puerto. TypeScript señalará cada punto que lo olvide.
3. Si toca una cuenta ajena, pásala por `canManageTrainer`; si escribe un grupo,
   por `requireWriteScope`.
4. Si muta el perfil, revoca los tokens del afectado.
5. Escribe la prueba junto al código. La que importa no es el camino feliz: es
   que el catálogo siga sin recibir alcance, que los candidatos se filtren por la
   dependencia del grupo, y que `none` no se convierta en `{}`.
