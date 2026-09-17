# Dependencias y alcance — Referencia

## 1. Qué es

La dependencia es la unidad organizativa que **separa la operación** del
instituto. No es una etiqueta: es lo que decide qué filas ve cada persona.

Dos módulos se reparten el trabajo:

- `app/modules/dependencies/` administra las unidades y designa a sus titulares.
  Solo entra el superadministrador.
- `app/modules/users/` administra al personal, y cada quien ve únicamente el
  suyo. El recorte lo aplica el alcance, no una pantalla distinta.

**No hay un "directorio de mi personal".** El directorio *es*
`/dashboard/usuarios` visto por un titular. Una segunda lista duplicaría el mismo
query con otro guard, que es justo donde se cuelan los fallos de aislamiento.

## 2. Roles

| Valor | Copia | Alcance | Qué hace |
| --- | --- | --- | --- |
| `SUPERADMIN` | Superadministrador | Global | Crea y desactiva dependencias, designa titulares, administra a cualquiera |
| `DEPENDENCY_HEAD` | Titular | Su dependencia | Uno por dependencia. Da de alta a su personal, designa y retira auxiliares |
| `DEPENDENCY_DEPUTY` | Auxiliar | Su dependencia | Lo mismo que el titular salvo gestionar auxiliares |
| `USER` | Participante | Lo propio | Rol base. Ve su perfil y se cambia de dependencia |
| `ADMIN` | Administrador | Global | Heredado de la plantilla. Ninguna cuenta del instituto lo usa |

La tupla se edita en `app/shared/rules/atoms.rules.ts` y **solo ahí**. La
jerarquía entre roles no vive con ella: está en
`app/modules/users/domain/user.access.rules.ts`, porque nombrar roles concretos
en código compartido rompe el contrato de "editar solo esa tupla".

## 3. El alcance, de dentro hacia fuera

### 3.1 · El claim

`dependencyId` viaja firmado en el access token, junto a `role`. Se arma en
`buildPayload` (`auth.service.server.ts`), el único sitio que firma, así que el
login y las dos ramas del refresh lo heredan sin tocarse.

Va en el token y no se lee por petición porque la maquinaria de invalidación ya
existe y resolverlo por petición costaría un `SELECT` en cada una. El precio es
que **toda mutación de rol o de dependencia revoca los tokens del afectado**.

### 3.2 · La traducción

`app/shared/auth/scope.rules.ts` convierte el claim en un `AccessScope`:

```
global      → SUPERADMIN, ADMIN
dependency  → DEPENDENCY_HEAD, DEPENDENCY_DEPUTY con dependencia
self        → USER
none        → DEPENDENCY_HEAD o DEPENDENCY_DEPUTY SIN dependencia
```

`none` no es defensivo por gusto. Un titular cuya fila quedara sin dependencia
tiene que traducirse a "no ve nada" y jamás a un `where` vacío, que es lo que
pasaría si el caso cayera en una rama por defecto. El `switch` es exhaustivo con
comprobación `never`: añadir un rol a la tupla rompe en compilación, porque
decidir su alcance es parte de añadirlo.

### 3.3 · La aplicación

`requireScope` (`app/shared/auth/require-scope.server.ts`) hace `requireRole` y
`resolveScope` en un solo acto, para que no se pueda acertar el rol y olvidar el
alcance: son dos decisiones que van siempre juntas, y separarlas deja una puerta
abierta que compila.

El alcance es un **parámetro explícito** de cada operación, nunca un valor del
contenedor. Las lecturas reciben `scope`; las mutaciones reciben el
`AuthContext`, porque además del alcance tienen que comparar rangos: un auxiliar
y su titular comparten dependencia.

En el repositorio el filtro va **dentro del `where`**, junto a la clave única:

```ts
prisma.user.update({ where: writeWhere(documentId, scope), data });
```

Si la cuenta existe pero cae fuera, Prisma lanza P2025 y se traduce a
`UserNotFoundError`. **Fuera de alcance se ve igual que inexistente**, que en
seguridad es el resultado correcto: no confirma que el registro exista.

## 4. Lo que impone la base, y por qué no la aplicación

Dos invariantes viven en la migración escritas a mano, porque Prisma no las
expresa y dejarlas en la aplicación las haría opinables:

```sql
CREATE UNIQUE INDEX users_one_head_per_dependency
  ON auth.users (dependency_id)
  WHERE role = 'DEPENDENCY_HEAD' AND archived_at IS NULL;

ALTER TABLE auth.users ADD CONSTRAINT users_type_coherence CHECK (
  (type = 'EXTERNAL' AND dependency_id IS NULL AND employee_number IS NULL)
  OR
  (type = 'INTERNAL' AND employee_number IS NOT NULL
     AND (dependency_id IS NOT NULL OR role = 'SUPERADMIN'))
);
```

El índice parcial es lo único que resiste **dos designaciones simultáneas**: la
comprobación que hace `assignHead` antes de escribir es una cortesía para dar
buen mensaje, no la garantía.

El CHECK exime al superadministrador de tener dependencia porque su alcance es
global y no administra una unidad concreta.

## 5. `assignHead`, la operación delicada

Es una escritura compuesta, así que va en transacción explícita
(`docs/reglas.md` §8.1), y el orden **no es libre**:

1. Validar que el candidato pertenece a la dependencia y está activo.
2. Degradar al titular actual a `USER`, si lo hay.
3. Promover al candidato a `DEPENDENCY_HEAD`.

Al revés, el índice único parcial dispara a mitad de transacción: durante un
instante habría dos titulares activos en la misma dependencia.

Fuera del commit se revocan los tokens de **los dos**. El relevado pierde la
gestión y el promovido la gana, y ninguno de los dos cambios se nota mientras
siga vivo el access token que firmó el rol anterior.

`DEPENDENCY_HEAD` **no se otorga desde el formulario de usuario**, ni siquiera
para el superadministrador (`ASSIGNABLE_ROLES` no lo incluye para nadie):
hacerlo se saltaría este relevo.

Esta operación escribe en `auth.users` desde el repositorio de `dependencies`.
Es la **única** excepción de frontera del diseño, está documentada en el puerto y
razonada en `docs/adr/0001`: una transacción no puede repartirse entre dos
repositorios.

## 6. Cambio de adscripción

Inmediato y sin aprobación (`changeDependency`). Escribe en la misma transacción
el `UPDATE` de la cuenta y el `INSERT` en `org.dependency_changes`, para que no
quede alguien movido sin rastro de quién lo movió.

Cuando lo hace un titular, un auxiliar o el superadministrador —no la propia
persona—, se encola en la misma transacción el aviso `DEPENDENCY_CHANGED` con la
dependencia de origen y la de destino (PRD-08).

Reglas que gobiernan el cambio:

- Un **titular no puede cambiarse mientras lo sea**, ni por su cuenta ni movido
  por un administrador. Dejaría su dependencia sin quien la administre, y el
  índice parcial le impediría ser titular de la nueva. Primero se designa a otro.
- Un **auxiliar pierde el cargo** al salir: `roleAfterDependencyChange` lo
  degrada a `USER`. Auxiliar y titular son cargos DE una dependencia, no
  atributos de la persona. Inscripciones, créditos e historial se conservan.
- Una dependencia **desactivada no es destino**, aunque conserve su personal y su
  historial.
- Moverse a la dependencia en la que ya se está no escribe bitácora ni cierra
  sesiones.

`org.dependency_changes` guarda ids escalares **sin `@relation` declarada**: es
bitácora. Declararlas obligaría a cuatro relaciones inversas para una tabla que
solo se lee en bloque, y además así una fila sobrevive al borrado permanente de
la cuenta que describe. Los nombres se resuelven en una segunda consulta.

## 7. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| Un titular abre por URL el detalle de alguien de otra dependencia | El filtro va en el `where`: P2025 → 404, no el registro |
| Un titular deduce quién existe por el mensaje de error | Fuera de alcance responde igual que inexistente |
| El total de la paginación delata cuentas ajenas | `findAll` y `count` comparten literalmente el mismo `where` |
| Un filtro en la URL amplía lo que alguien alcanza | El filtro por dependencia se SUMA al alcance; pedir otra no devuelve nada |
| Un auxiliar archiva a su titular | `canManageUser` compara rangos además del alcance |
| Alguien se otorga un rol superior enviando el formulario a mano | `canAssignRole` se comprueba en el servidor, no solo al pintar el `Select` |
| Dos designaciones simultáneas dejan dos titulares | Índice único parcial; la comprobación previa solo da buen mensaje |
| Una fila sin dependencia da acceso a todo | `AccessScope.none` → predicado imposible al leer, corte al escribir |
| Un usuario archivado sigue entrando | Comprobado en login y en las dos ramas del refresh, más revocación al archivar |

## 8. Añadir una operación con alcance

1. Decide si es lectura o mutación. Lectura → parámetro `scope`. Mutación →
   parámetro `actor: AuthContext`.
2. Declara la firma en el puerto (`domain/*.repository.ts` o `*.service.ts`).
   TypeScript señalará cada punto que lo olvide; ese es el mecanismo.
3. En el repositorio, funde el filtro **dentro del `where`**. Para escribir usa
   `writeWhere`, que corta el alcance vacío antes de tocar la base: el `where` de
   un `update` exige igualdad sobre la clave única y no admite `IN ()`.
4. En el servicio, si la operación toca una cuenta ajena, pásala por
   `requireManageable`: reúne alcance y rango, y responde 404 o `FORBIDDEN_SCOPE`
   según cuál falle.
5. Si muta el rol o la dependencia, revoca los tokens del afectado.
6. Escribe la prueba junto al código. La que importa no es el camino feliz: es
   que el alcance llegue al repositorio y que `none` no se convierta en `{}`.
