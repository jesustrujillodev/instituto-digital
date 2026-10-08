# Guía de rendimiento — casos de uso y repositorios

Guía **portable y sin dominio** para escribir servicios (`application/`) y repositorios (`infrastructure/`) que ya nacen optimizados, y para optimizar los existentes sin cambiar lo que devuelven. Complementa a `docs/reglas.md` §26, que cubre los adaptadores de entrada (loaders): aquella regla decide **qué** se pide; esta, **cómo** lo resuelven el caso de uso y su repositorio.

**Stack asumido (el de la plantilla):** servidor con base de datos remota, ORM con transacciones interactivas (Prisma con `runInTransaction` sobre `AsyncLocalStorage`), casos de uso que devuelven `AppResponse<T>` envueltos en `createOperationRunner`, repositorios que devuelven dominio crudo y lanzan errores tipados, DI por contenedor. Los ejemplos usan entidades genéricas (`Order`, `OrderLine`, `Item`, `Customer`); sustituye los nombres por los tuyos.

**Cómo usar esta guía**

| Situación | Empieza por |
|---|---|
| Voy a escribir un caso de uso o un repositorio | [§2 reglas](#2-reglas) y [§9 checklist](#9-checklist-por-caso-de-uso-y-repositorio) |
| Voy a optimizar código existente | [§1](#1-modelo-de-costo), [§3 patrones](#3-catálogo-de-patrones), [§4 equivalencia](#4-garantía-de-comportamiento-idéntico) y [§7 medición](#7-medir) |
| Quiero llevar estas reglas a otro proyecto de la plantilla | [§10 bloques listos para pegar](#10-bloques-listos-para-pegar) |
| Dudo si vale la pena un cambio | [§5 cuándo descartar](#5-cuándo-descartar) |

---

## 1. Modelo de costo

Tres hechos gobiernan todo lo demás:

1. **Lo que cuesta es el viaje, no el dato.** Con la base remota, cada consulta paga la latencia de red completa (decenas de ms). `tiempo ≈ viajes en fila × latencia`. Diez consultas en paralelo cuestan casi lo mismo que una; diez en fila cuestan diez veces.
2. **Dentro de una transacción no hay paralelo.** Una transacción interactiva retiene **una** conexión y el ORM serializa sus consultas. `Promise.all` dentro de `runInTransaction` no ahorra nada: ahí lo único que cuenta es **cuántas sentencias** se mandan.
3. **El tiempo con un bloqueo tomado es contención.** Cada sentencia que se ejecuta después de un `SELECT … FOR UPDATE` alarga el tiempo que otras peticiones esperan esa fila. Una escritura fila a fila dentro de la transacción multiplica la espera de todos.

De ahí salen dos objetivos distintos según dónde esté el código:

| Dónde | Qué se optimiza |
|---|---|
| Fuera de transacción (lecturas de un caso de uso) | **Fases**: cuántos `await` van en fila. Lo independiente, en paralelo. |
| Dentro de transacción (mutaciones) | **Sentencias**: cuántas consultas se mandan. Lo que es por fila, por lote. |

---

## 2. Reglas

1. **Sin consultas por fila.** Prohibido llamar al repositorio dentro de un `map`/bucle por cada elemento, también dentro de `Promise.all`. El repositorio ofrece la variante por lote (`IN`) y el servicio arma en memoria. [P1](#p1-n1-en-el-caso-de-uso--método-por-lote)
2. **Una fase por grupo de lecturas independientes.** Va en fila solo lo que necesita el resultado de otra lectura. Si las lecturas paralelas pueden lanzar errores distintos, el error que gana tiene que seguir siendo el de la que iba primero: `allInOrder`. [P2](#p2-lecturas-en-fila-que-no-dependen-entre-sí)
3. **Romper dependencias falsas.** Si la segunda lectura solo usa el `id` que devolvió la primera, se acota por relación o por la clave pública que ya se tiene, y viajan juntas. [P3](#p3-dependencias-falsas-acotar-por-relación-o-por-clave-pública)
4. **Lo que se usa junto se lee junto.** Una relación, un conteo o "la fila de este usuario" van en la misma consulta que el registro principal, no en otra. [P4](#p4-traer-lo-relacionado-en-la-misma-consulta)
5. **Una fila, una lectura.** Dos métodos que leen la misma fila en el mismo flujo se fusionan en uno que devuelve ambas proyecciones. [P5](#p5-lectura-doble-de-la-misma-fila)
6. **No releer lo que ya se tiene.** Si el servicio ya leyó un registro (dentro de la misma transacción), pasa su `id` al repositorio en vez de que este lo vuelva a buscar. [P6](#p6-no-releer-pasar-lo-ya-leído)
7. **Bloquear no es leer.** Separar "bloquear la fila" de "bloquear y leer". Quien solo serializa usa el bloqueo sin lecturas. [P7](#p7-bloqueos-separar-bloquear-de-leer)
8. **Escrituras por lote dentro de transacciones.** Nada de `create`/`update`/`upsert` por fila: `createMany`, `updateMany` agrupando por valores iguales, `createManyAndReturn` para padres con hijos. Con la misma semántica que el bucle (último gana, errores tipados, conteos). [P8](#p8-escrituras-fila-a-fila--por-lote)
9. **Leer solo lo que el caso de uso usa.** Una mutación que solo necesita el `id` no lee el agregado completo; un filtro que se puede expresar en `where` no se aplica en memoria; para un elemento no se lee la colección. [P9](#p9-leer-solo-lo-que-se-usa)
10. **Decidir antes de leer, cuando decidir es barato.** Comprobaciones síncronas (alcance, rol, validación del DTO) y límites de tasa van antes de cualquier lectura. Lo que depende de una lectura se comprueba después de la fase paralela, en el orden original.
11. **Mismo resultado, comprobado.** Toda optimización conserva resultado, errores (y su orden), permisos, forma de la respuesta y semántica ante duplicados y carreras. Se demuestra con pruebas y con la comparación de respuestas. [§4](#4-garantía-de-comportamiento-idéntico)

---

## 3. Catálogo de patrones

Cada patrón: **síntoma → qué resuelve → cómo → cómo se conserva el resultado**.

### P1. N+1 en el caso de uso → método por lote

**Síntoma.**

```ts
const summaries = await Promise.all(
  orders.map(async (order) => {
    const lines = await orderRepository.findLines(order.id); // 1 consulta por pedido
    return summarize(order, lines);
  }),
);
```

`Promise.all` no lo arregla: son N consultas que compiten por el pool. Con el pool lleno, se encolan y vuelven a ir en fila.

**Cómo.** El repositorio ofrece la variante por lote y devuelve un `Map` por clave, con **todas** las claves presentes (vacías si no hay filas), para que el servicio no distinga "sin filas" de "no pedido":

```ts
async findLinesIn(orderIds) {
  const byOrder = new Map<number, OrderLine[]>(orderIds.map((id) => [id, []]));
  if (orderIds.length === 0) return byOrder;

  const rows = await prisma.orderLine.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: { position: "asc" },            // el mismo orden que la versión individual
    select: { orderId: true, ...LINE_SELECT },
  });
  for (const { orderId, ...line } of rows) byOrder.get(orderId)?.push(line);
  return byOrder;
}
```

```ts
const linesOf = await orderRepository.findLinesIn(orders.map((o) => o.id));
const summaries = orders.map((order) => summarize(order, linesOf.get(order.id) ?? []));
```

**Conservar el resultado.**

- Mismo `where` que la versión individual, con `=` cambiado por `IN`, y mismo `orderBy`: dentro de cada grupo el orden se conserva porque el reparto en memoria respeta el orden de llegada.
- **Trampa:** si el filtro individual comparaba dos columnas contra el mismo valor (`item.orderId = X AND item.parent.orderId = X`), con `IN` deja de exigir que sean **iguales entre sí**. Se trae la columna y se re-comprueba en memoria (`if (row.parent.orderId !== row.orderId) continue`).
- Si la versión individual deduplicaba por clave (`mejor nota por elemento`), la clave del lote incluye el agrupador (`${orderId}:${itemId}`).
- Si el servicio filtraba "solo los que cumplen X" y luego consultaba por cada uno, la consulta por lote puede leer el conjunto completo con el filtro del registro padre y filtrar en memoria: así incluso entra en la misma fase que el padre.

### P2. Lecturas en fila que no dependen entre sí

**Síntoma.** `const a = await x(); const b = await y();` donde `y` no usa `a`.

**Cómo.** Dibujar el grafo de dependencias: va en fila solo lo que consume el resultado de otra lectura.

- Si ninguna de las lecturas lanza errores de dominio (devuelven `null` y la comprobación va después): `Promise.all` y luego las comprobaciones **en el mismo orden de antes**.
- Si pueden lanzar errores distintos: `allInOrder` (ver [§8](#8-el-helper-allinorder)). Con `Promise.all` ganaría el que falle **primero en el tiempo**; con `allInOrder` gana el de la **primera posición**, que es el que ganaba cuando iban en fila.

```ts
const [customer, data] = await allInOrder([
  resolveCustomer(dto.customer, scope),   // sus errores ganaban antes
  buildWriteData(dto, scope),             // sus errores, solo si el anterior pasa
]);
```

- Si una comprobación de dominio iba **entre** las dos lecturas, se cuelga de la primera con `.then`, para que sus errores sigan ganando:

```ts
const [slot, upload] = await allInOrder([
  repository.findSlot(id).then((slot) => {
    if (!slot) throw new SlotNotFoundError();
    assertSlotCapacity(slot.count);
    return slot;
  }),
  verifyUploadedObject(dto.key),          // storage: antes iba después del tope
]);
```

**Conservar el resultado.** Las lecturas que se lanzan antes de tiempo deben ser **sin efectos** (lecturas de BD, `HEAD` de storage). Lo que se lee y se descarta por un error no viaja al cliente. Lo que **no** se adelanta: límites de tasa (su propósito es no leer) y cualquier escritura.

### P3. Dependencias falsas: acotar por relación o por clave pública

**Síntoma.** La segunda lectura espera a la primera solo para usar su `id`:

```ts
const credits = await prisma.credit.findMany({ where: { userId } });
const attendance = await prisma.attendance.findMany({
  where: { userId, session: { courseId: { in: credits.map((c) => c.courseId) } } },
});
```

**Cómo.** Expresar el mismo conjunto con un filtro por relación, que no necesita el resultado de la primera:

```ts
const mine = { userId, revokedAt: null };
const [credits, attendance] = await Promise.all([
  prisma.credit.findMany({ where: mine, … }),
  prisma.attendance.findMany({
    where: { userId, session: { course: { credits: { some: mine } } } },
  }),
]);
```

Variantes del mismo patrón:

- **Por clave pública.** Si el servicio tiene el `documentId` del padre y la segunda lectura pedía `parent.id`, se ofrece `findXByParentDocumentId(documentId, …)` con `where: { parent: { documentId } }`. Para una relación única es la misma fila.
- **Por el id que ya se conoce.** Si el dueño ya resuelto tiene el mismo id que el registro que se busca (un registro 1:1 con su dueño), se lanza la lectura dependiente con ese id en la misma fase.
- **Mismo conjunto de partida.** Varias lecturas que parten de "las cuentas de esta lista que cumplen X" comparten el filtro (`{ documentId: { in }, profile: { isNot: null } }`) y viajan juntas en vez de encadenarse por ids.

**Conservar el resultado.** Demostrar que ambos filtros describen **el mismo conjunto** (mismas condiciones, mismo estado, misma relación). Si el filtro original incluía una condición que el de relación no puede expresar (comparar columnas, reglas de negocio en memoria), no se aplica este patrón.

### P4. Traer lo relacionado en la misma consulta

**Síntoma.** `findX(id)` seguido de `countY(x.id)` o `findMembership(x.id, userId)`.

**Cómo.** Pedirlo en la misma consulta: `_count` para conteos, una relación filtrada para "la fila de esta persona":

```ts
select: {
  ...ORDER_SELECT,
  _count: { select: { payments: true } },
  members: { where: { userId: viewerId }, select: { status: true } },
}
```

Con joins del ORM activos (en Prisma, `relationJoins`), viaja como **una** consulta.

**Conservar el resultado.**

- Un método hermano (`findOrderWithPaymentCount`) en vez de cambiar la proyección de uno que ya usan otros: no se cambia la forma que reciben los demás consumidores.
- Si el resultado del caso de uso es un DTO construido campo a campo, añadir datos a la lectura no cambia su forma. Si se esparce (`...row`), se separan antes (`const { members, ...order } = row`).
- Es **más** consistente que dos lecturas: ambas cosas salen de la misma instantánea.

### P5. Lectura doble de la misma fila

**Síntoma.** `findRecord(id)` y `findSettings(id)` en el mismo flujo, y los dos leen la misma fila con proyecciones distintas.

**Cómo.** Un método que devuelve las dos proyecciones con sus propios defaults:

```ts
async findRecordWithSettings(id) {
  const row = await prisma.config.findUnique({
    where: { id },
    select: { ...RECORD_SELECT, isPublic: true, note: true },
  });
  return {
    record: toRecord(row, id),
    settings: row ? { isPublic: row.isPublic, note: row.note } : DEFAULT_SETTINGS,
  };
}
```

**Conservar el resultado.** Los defaults sin fila salen de una sola constante compartida con el método individual. La respuesta del caso de uso sigue llevando `record` y `settings` por separado. Dentro de una transacción, mover la segunda lectura antes es válido solo si nada de lo que se escribe entre medias toca esa fila.

### P6. No releer: pasar lo ya leído

**Síntoma.** El servicio lee el registro (para validar), y el método de escritura del repositorio lo vuelve a buscar con el mismo `where`.

**Cómo.** El método recibe el `id` (o `null` si hay que crearlo):

```ts
replaceLines(parentId, owner, lines, existingId: number | null)
```

**Conservar el resultado.** La lectura del servicio y la escritura van en la **misma** transacción, después del bloqueo; si no, entre ambas puede cambiar la fila. Si antes la escritura podía encontrar un registro que el servicio no, no se aplica.

### P7. Bloqueos: separar bloquear de leer

**Síntoma.** Un `lockXAndCount()` que hace `FOR UPDATE` + dos lecturas, llamado por sitios que **ignoran** lo que devuelve y solo quieren serializar.

**Cómo.** Dos métodos: `lockX(id)` (solo el `FOR UPDATE`) y `lockXAndCount(id)` = `lockX` + lecturas. Cada llamador usa el que necesita.

```ts
const lockOrder = async (id: number) => {
  await prisma.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
};

return {
  lockOrder,
  async lockOrderAndCount(id) {
    await lockOrder(id);
    const [order, lines] = await Promise.all([…]);
    return { capacity: order.capacity, used: lines };
  },
};
```

> Usar una función local, no `this.lockOrder`: el repositorio es un objeto literal y `this` depende de cómo lo llamen (un decorador o una desestructuración lo rompen).

**Conservar el resultado.**

- Mismo `FOR UPDATE`, misma fila: la serialización es idéntica.
- **No** fusionar en la misma sentencia del `FOR UPDATE` las lecturas que deben ver lo que otra transacción acaba de confirmar. En `READ COMMITTED`, cada **sentencia** toma su instantánea al empezar; una subconsulta en la sentencia del bloqueo puede no ver lo que se confirmó mientras se esperaba el bloqueo. Por eso las lecturas posteriores al bloqueo van en sentencias separadas.

### P8. Escrituras fila a fila → por lote

**Síntoma.** Dentro de una transacción:

```ts
for (const mark of marks) {
  await prisma.attendance.upsert({ where: { sessionId_userId: … }, create: …, update: … });
}
```

N sentencias con el bloqueo tomado.

**Cómo, según la operación.**

| Bucle original | Lote equivalente |
|---|---|
| `updateMany` por persona con datos distintos | Agrupar por **valores idénticos** de `data` → un `updateMany` con `userId: { in }` por grupo |
| `upsert` por fila | Por grupo de valores: `createMany({ skipDuplicates: true })` **y después** `updateMany` con los mismos datos |
| `create` del padre con sus hijos anidados, por padre | `createManyAndReturn` de los padres (devolviendo `id` + una clave natural, p. ej. `position`) y un `createMany` de todos los hijos colgados por esa clave |
| `save(data, expected)` por fila (crea o actualiza condicionado al estado leído) | `createMany` para los que no existían + un `updateMany` por grupo `(estado esperado, campos)` comprobando `count === tamaño del grupo` |

Helper genérico de agrupación (orden de aparición, primer elemento como muestra):

```ts
const groupBy = <T extends { userId: number }>(rows: readonly T[], keyOf: (row: T) => string) => {
  const groups = new Map<string, { sample: T; userIds: number[] }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.userIds.push(row.userId);
    else groups.set(key, { sample: row, userIds: [row.userId] });
  }
  return [...groups.values()];
};
```

**Conservar el resultado (cada punto es obligatorio).**

1. **Duplicados con la semántica del bucle.** Si una clave aparece dos veces, el bucle dejaba el **último** valor (`update`) o el **primero** (una escritura condicionada a `IS NULL`). Se deduplica antes con `new Map(rows.map((r) => [r.key, r]))` (último gana) o quedándose con la primera aparición.
2. **Clave de agrupación exacta.** Incluye todo lo que va en `data` y en `where` (estado esperado, ids de relación, fechas). `null` y `0` son grupos distintos. `JSON.stringify` de los campos sirve como clave.
3. **Errores tipados idénticos.** La violación de unicidad del `createMany` se traduce al mismo error de dominio que daba el `create` individual. Un `updateMany` condicionado que toca **menos filas que el grupo** es el mismo "el estado cambió" que daba `count === 0` en el individual. La transacción revierte el lote entero, como antes revertía las filas ya escritas.
4. **Validaciones por fila, en memoria, antes de escribir.** Lo que el bucle comprobaba por elemento (transiciones de estado) se comprueba primero para todos; el primer fallo lanza el mismo error.
5. **Orden en el upsert por lote: crear primero.** `createMany(skipDuplicates)` y después `updateMany`. Si otro proceso inserta la fila entre las dos sentencias, el `updateMany` la sobreescribe, igual que un `upsert` que llega después. Al revés, el `createMany` la saltaría y la escritura se perdería.
6. **Hijos colgados por clave natural, no por orden de retorno.** El orden de las filas que devuelve `createManyAndReturn` no está garantizado: se mapea por la clave natural devuelta (`position`) y, si falta una, se lanza.
7. **Lotes vacíos no consultan.** `if (rows.length === 0) return`.

### P9. Leer solo lo que se usa

| Síntoma | Cómo |
|---|---|
| La mutación lee el agregado completo (lista de miembros, historial) solo para obtener su `id` y comprobar el alcance | `findXId(documentId, where)` que comparte **el mismo `where`** con `findX` (extraído a una función `xWhere()` para que no puedan divergir) y selecciona solo `id` |
| Se lee la colección de una persona para buscar un elemento (`.find(...)`) | Un método por clave única, con **el mismo filtro de pertenencia** que la colección (activo, del mismo padre) |
| Se leen todas las filas del padre y se filtran por usuario en memoria | El filtro en el `where` (`userId: { in }`), opcional para que el llamador sin filtro siga leyendo todo |
| Se cuenta leyendo la colección | `_count` o `count` |

**Conservar el resultado.** El `where` reducido tiene que describir el mismo subconjunto que el filtro en memoria. Un método que queda sin uso tras el cambio se elimina del puerto y del adaptador.

### P10. Lo que no es patrón: cuándo una optimización empeora algo

- **Más consultas, misma latencia.** Adelantar una lectura por lote a la primera fase puede costar una consulta extra cuando el lote resulta vacío (antes eran cero). Es aceptable si no añade fase y ahorra N en el caso normal; se documenta.
- **Más llamadas a un servicio externo para ahorrar una fase.** Consultar storage por todas las referencias en vez de solo por las nuevas, para poder lanzarlo antes, cambia una decisión explícita (no consultar lo ya guardado). Si la decisión está documentada o probada, se respeta y el cambio se descarta.

---

## 4. Garantía de comportamiento idéntico

Toda optimización conserva estos invariantes. Cada uno tiene su comprobación:

| Invariante | Cómo se comprueba |
|---|---|
| Mismo resultado | Prueba del repositorio que compara la versión nueva con la anterior (o con la individual) sobre los mismos datos; comparación de respuestas `.data` antes/después en las rutas afectadas |
| Mismos errores, en el mismo orden | Prueba del servicio con **dos** fallos a la vez: gana el que iba primero |
| Mismo alcance y permisos | El filtro nuevo es el mismo `where` (función compartida) o se demuestra que describe el mismo conjunto |
| Misma forma de respuesta | Métodos hermanos en vez de cambiar proyecciones compartidas; separar campos añadidos antes de esparcir |
| Misma semántica ante duplicados | Prueba con una clave repetida: último gana / primero gana, como el bucle |
| Mismo comportamiento ante carreras | Orden de sentencias razonado (P7, P8.5) y anotado en un comentario cuando no es obvio |
| Misma atomicidad | Los lotes van en la misma transacción que el bucle al que sustituyen |

---

## 5. Cuándo descartar

Se descarta (y se anota en el PR con su motivo) cuando:

1. **No gana fases ni sentencias.** Reordenar lecturas que siguen sumando las mismas fases no aporta.
2. **Contradice una decisión documentada o probada.** Si una prueba existente fija un comportamiento (p. ej. "no consultar lo ya guardado"), se respeta.
3. **Exige una herramienta que el proyecto no admite.** Algunos lotes solo bajan a una sentencia con SQL crudo (`UPDATE … FROM (VALUES …)`, `INSERT … ON CONFLICT … DO UPDATE WHERE`, `UPDATE … RETURNING` de una cola). Si el proyecto decidió "solo API del ORM", se quedan como están.
4. **Cambia la carga sobre un tercero.** Paralelizar envíos de correo o bloques de un escaneo de storage puede chocar con límites del proveedor o saturar el pool, y cambiar el resultado (reintentos, fallos).
5. **Ahorra un viaje en una acción rara y toca filtros delicados o autorización.** Costo contra riesgo (`docs/reglas.md` §26.5).
6. **Cruza fronteras de módulo.** Un repositorio que tendría que mapear entidades de otro módulo para ahorrar un viaje rompe la separación de capas.

---

## 6. Pruebas

Las de siempre (`AGENTS.md`, "Cobertura obligatoria por módulo") más estas, específicas de una optimización:

**Repositorio (`infrastructure/__tests__/`)**, con un doble del cliente que registra cada llamada:

- El `where`/`data`/`orderBy` exactos que envía cada método nuevo, y que el `where` de un método "ligero" es **igual** al del completo (`expect(calls[1].where).toEqual(calls[0].where)`).
- Agrupación: varias claves con valores iguales y distintos → un `updateMany` por grupo, con los ids en el orden de aparición.
- Duplicados: una clave repetida → el valor que dejaba el bucle.
- Errores: unicidad en `createMany` y conteo menor en `updateMany` → el error tipado, comparando su `code`.
- Lote vacío → ninguna consulta.
- Por lote con `Map`: claves sin filas presentes y vacías; la re-comprobación en memoria descarta lo que el filtro individual excluía.

**Servicio (`application/__tests__/`)**, con dobles que implementan solo los métodos que se tocan:

- Que la lectura por lote se llama **una vez** con todas las claves (y no la individual).
- Que la escritura por lote se llama una vez con todo el lote.
- Orden de errores donde se paralelizó: forzar dos fallos y comprobar el `code` que gana.
- Que se pasa al repositorio el `id` ya leído (o `null` para crear).

---

## 7. Medir

**Lecturas** (`docs/reglas.md` §26.2): servidor recién arrancado con el contador de consultas (`DEBUG_QUERY_COUNT=true`), cada ruta afectada pedida varias veces descartando la primera, y la respuesta `.data` guardada antes y después para compararla ignorando marcas de tiempo y firmas. Las diferencias explicables (datos que cambian por la propia medición, como sesiones creadas al iniciar sesión) se verifican aparte.

**Mutaciones:** si la base de desarrollo es compartida o su outbox de correo lo envía otro entorno, **no** se disparan acciones reales para medir. Los viajes se cuentan por construcción (sentencias por llamada en las pruebas del repositorio) y la equivalencia la dan las pruebas del servicio y del repositorio.

Tabla antes/después y lista de descartados con su motivo en la descripción del PR.

---

## 8. El helper `allInOrder`

Vive en `app/shared/concurrency/all-in-order.ts` (helper puro: se importa, no se inyecta).

```ts
/**
 * `Promise.all` cuyo error es el de la primera posición que falló, no el del
 * primero en fallar en el tiempo. Es lo que permite lanzar a la vez lecturas
 * que antes iban en fila sin cambiar qué error gana: el de la que iba antes.
 */
export const allInOrder = async <const T extends readonly unknown[]>(
	promises: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> => {
	const settled = await Promise.allSettled(promises);
	for (const result of settled) {
		if (result.status === "rejected") throw result.reason;
	}
	return settled.map(
		(result) => (result as PromiseFulfilledResult<unknown>).value,
	) as { -readonly [K in keyof T]: Awaited<T[K]> };
};
```

Su prueba (`app/shared/concurrency/__tests__/all-in-order.test.ts`) cubre: valores en orden de entrada, gana el error de la primera posición aunque falle después, y un éxito previo no oculta un fallo posterior.

Diferencia con `Promise.all`: espera a **todas** antes de decidir. Para lecturas (lo único que se le pasa) el costo es nulo: la fase dura lo que la más lenta.

---

## 9. Checklist por caso de uso y repositorio

1. ¿Hay alguna llamada al repositorio dentro de un `map`/bucle? → variante por lote.
2. ¿Qué `await` van en fila? ¿Cada uno necesita el resultado del anterior? Los que no, a una fase.
3. ¿Alguno espera solo por un `id`? → acotar por relación o por clave pública.
4. ¿Hay conteos o "la fila de esta persona" en otra consulta? → en la misma.
5. ¿Dos métodos leen la misma fila? → uno.
6. ¿El repositorio vuelve a buscar algo que el servicio ya leyó en la misma transacción? → pasar el `id`.
7. ¿Se bloquea y se lee lo que nadie usa? → bloqueo sin lecturas.
8. ¿Hay escrituras por fila dentro de la transacción? → por lote, con la semántica de duplicados, errores y carreras del bucle.
9. ¿Se lee más de lo que se usa (agregado para un `id`, colección para un elemento, todo para filtrar en memoria)?
10. ¿Las comprobaciones baratas van antes de leer, y las que dependen de lecturas, en el orden original?
11. ¿Las pruebas cubren `where` exacto, agrupación, duplicados, errores tipados, orden de errores y lote vacío?
12. ¿Se midió (lecturas) o se contó por construcción (mutaciones), y lo descartado quedó anotado?

---

## 10. Bloques listos para pegar

Los tres archivos de reglas de un proyecto de la plantilla reciben el mismo contenido: `docs/reglas.md` la regla agnóstica, y `AGENTS.md` / `CLAUDE.md` (mismo texto) su versión operativa con las piezas del proyecto. Requisito previo: copiar `all-in-order.ts` y su prueba a `app/shared/concurrency/`.

### 10.1 `docs/reglas.md`

**Nueva sección, después de la 26:**

```markdown
## 27. Rendimiento de casos de uso y repositorios (obligatorio)

Objetivo: que un caso de uso resuelva su trabajo con el menor numero de fases de lectura y de sentencias de escritura, sin cambiar lo que devuelve ni que error da. Complementa la seccion 26: aquella decide que pide el adaptador de entrada; esta, como lo resuelven el caso de uso y su repositorio.

### 27.1 Modelo de costo

1. Fuera de una transaccion, el costo son las fases: cuantas lecturas van en fila. Lo independiente va en paralelo.
2. Dentro de una transaccion interactiva no hay paralelo: el ORM serializa sobre una sola conexion. El costo son las sentencias.
3. Cada sentencia ejecutada con un bloqueo tomado alarga la espera de las demas peticiones sobre esa fila.

### 27.2 Reglas

1. Prohibido consultar el repositorio por cada elemento de una coleccion, tambien dentro de `Promise.all`. El repositorio ofrece la variante por lote (`IN`) y devuelve un mapa por clave con todas las claves presentes.
2. Va en fila solo la lectura que necesita el resultado de otra. Las independientes van en una sola fase. Si pueden lanzar errores distintos, se espera a todas y gana el error de la que iba primero (helper puro en `shared/`), nunca el primero en el tiempo.
3. Una lectura que solo esperaba el id de otra se acota por relacion o por la clave publica que ya se tiene, demostrando que describe el mismo conjunto.
4. Relaciones, conteos y la fila del usuario actual viajan en la misma consulta que el registro principal. Se agregan en un metodo hermano para no cambiar la forma que reciben otros consumidores.
5. Dos lecturas de la misma fila en un mismo flujo se fusionan en un metodo que devuelve ambas proyecciones con sus defaults.
6. Si el caso de uso ya leyo un registro dentro de la misma transaccion, pasa su id al repositorio en vez de que este lo vuelva a buscar.
7. Bloquear y leer son metodos distintos. Quien solo serializa usa el bloqueo sin lecturas. Las lecturas que deben ver lo confirmado por otros despues de esperar el bloqueo van en sentencias separadas del bloqueo.
8. Dentro de una transaccion, nada de escrituras por fila: `createMany`, `updateMany` agrupando por valores iguales, `createMany` con omision de duplicados seguido de `updateMany` para un upsert por lote, e insercion con retorno para padres con hijos, colgando los hijos por una clave natural y no por el orden de retorno.
9. Una mutacion que solo necesita el id no lee el agregado completo: usa un metodo que comparte el mismo filtro (una funcion `where` comun) y proyecta solo el id. Un elemento no se busca leyendo su coleccion. Un filtro expresable en la consulta no se aplica en memoria.
10. Comprobaciones sincronas y limites de tasa van antes de cualquier lectura. Las que dependen de lecturas se evaluan despues de la fase paralela, en el orden original.
11. Un metodo que queda sin uso tras una optimizacion se elimina del puerto y del adaptador.

### 27.3 Garantia de comportamiento identico

1. Mismo resultado, mismos errores en el mismo orden, mismo alcance y misma forma de respuesta (seccion 26.4).
2. Una escritura por lote replica la semantica del bucle: el mismo ganador ante claves repetidas (ultimo para actualizaciones, primero para escrituras condicionadas a vacio), el mismo error tipado ante unicidad violada o ante menos filas actualizadas de las esperadas, y la misma atomicidad (misma transaccion).
3. Un filtro por lote con `IN` que antes comparaba dos columnas contra el mismo valor re-comprueba en memoria que sean iguales entre si.
4. Solo se adelantan lecturas sin efectos. Nunca escrituras ni limites de tasa.

### 27.4 Cuando descartar

Se descarta, y se anota en el PR con su motivo, si: no reduce fases ni sentencias; contradice una decision documentada o una prueba existente; exige SQL crudo y el proyecto no lo admite; cambia la carga sobre un tercero (proveedor de correo, storage, pool); o ahorra un viaje en una accion poco frecuente tocando filtros de autorizacion.

### 27.5 Pruebas

1. Repositorio: `where`, `data` y orden exactos de cada metodo nuevo; igualdad del `where` entre un metodo ligero y el completo; agrupacion; duplicados; errores tipados por `code`; lote vacio sin consultas.
2. Caso de uso: lectura y escritura por lote invocadas una sola vez; orden de errores con dos fallos simultaneos; id ya leido pasado al repositorio.

### 27.6 Checklist

1. ¿Consultas por elemento?
2. ¿Lecturas en fila que no dependen entre si?
3. ¿Esperas solo por un id?
4. ¿Conteos o relaciones en otra consulta?
5. ¿Lecturas dobles de una fila?
6. ¿Relecturas dentro de la transaccion?
7. ¿Bloqueos que leen lo que nadie usa?
8. ¿Escrituras por fila en transaccion?
9. ¿Se lee mas de lo que se usa?
10. ¿Errores en el mismo orden?
11. ¿Medido o contado, y descartes anotados?
```

**En §15 (Definition of Done), nuevo punto:**

```markdown
8. Si el cambio agrega o modifica un caso de uso o un repositorio, cumple la seccion 27: sin consultas por elemento, sin lecturas en fila independientes, sin escrituras por fila dentro de transacciones, y con los mismos resultados y errores comprobados por pruebas.
```

**En §17 (Antipatrones), nuevos puntos:**

```markdown
13. Llamar al repositorio por cada elemento de una coleccion en un caso de uso, aunque sea dentro de `Promise.all`.
14. `create`, `update` o `upsert` dentro de un bucle en una transaccion.
15. Un metodo de bloqueo que lee datos que su llamador ignora.
16. Paralelizar lecturas con `Promise.all` cuando pueden lanzar errores distintos y el orden de esos errores importa.
17. Releer en el repositorio un registro que el caso de uso ya leyo en la misma transaccion.
```

### 10.2 `AGENTS.md` y `CLAUDE.md` (mismo bloque en los dos)

**En "Politica obligatoria por feature", nuevo punto:**

```markdown
9. Casos de uso y repositorios sin consultas por elemento, sin lecturas en fila independientes y sin escrituras por fila dentro de transacciones (ver "Rendimiento de servicios y repositorios" y docs/reglas.md §27).
```

**Nueva sección, después de "Rendimiento de loaders":**

```markdown
## Rendimiento de servicios y repositorios (obligatorio)

Todo caso de uso de `application/` y todo repositorio de `infrastructure/` cumple docs/reglas.md §27.
Fuera de una transaccion se optimizan las **fases** (lecturas en fila); dentro de `runInTransaction`
`Promise.all` no paraleliza nada y se optimizan las **sentencias**. Guia completa con ejemplos:
`docs/guia-rendimiento-servicios-repositorios.md`.

### Piezas del proyecto

| Pieza | Para que |
| --- | --- |
| `allInOrder` (`app/shared/concurrency/all-in-order.ts`) | Lanzar lecturas independientes a la vez conservando que error gana: el de la primera posicion. Helper puro: se importa. |
| Metodos por lote (`findXIn(ids)` → `Map<id, X[]>`) | Sustituir consultas por elemento. Todas las claves presentes, vacias si no hay filas. |
| `lockX` / `lockXAndRead` | Serializar sin leer / serializar y leer. Cada llamador usa el que necesita. |
| `createMany` · `updateMany` agrupado · `createManyAndReturn` | Escrituras por lote dentro de la transaccion. |
| Funcion `xWhere()` compartida | Que un metodo ligero (`findXId`) y el completo (`findX`) no puedan divergir en alcance. |

### Reglas

1. **Sin consultas por elemento.** Ni en `map` ni en `Promise.all(map(...))`. Se agrega el metodo por lote al puerto.
2. **Una fase por grupo independiente.** Si las lecturas pueden lanzar errores distintos, `allInOrder`. Si una comprobacion iba entre dos lecturas, se cuelga de la primera con `.then`.
3. **Sin esperas falsas.** Lo que solo esperaba un id se acota por relacion o por `documentId`.
4. **Lo que se usa junto se lee junto.** `_count`, relaciones filtradas y "la fila del usuario" en la misma consulta, en un metodo hermano.
5. **Ni lecturas dobles ni relecturas.** Una fila, un metodo; el id ya leido en la transaccion se pasa al repositorio.
6. **Escrituras por lote** con la semantica del bucle: deduplicar como el bucle (ultimo o primero gana), agrupar por todos los campos de `data` y `where`, P2002 y conteo menor → el mismo error tipado; upsert por lote = `createMany({ skipDuplicates })` y despues `updateMany`; hijos colgados por clave natural.
7. **Leer solo lo que se usa.** Ids con el mismo `where`, un elemento por clave unica con el mismo filtro de pertenencia, filtros en la consulta y no en memoria.
8. **Limites de tasa y comprobaciones sincronas, antes de leer.** Nunca se adelantan escrituras.
9. **Metodos sin uso tras optimizar, fuera** del puerto y del adaptador.

### Mismo funcionamiento, comprobado

- Pruebas de repositorio con `where`/`data` exactos, agrupacion, duplicados, errores por `code` y lote vacio.
- Pruebas de servicio con la lectura/escritura por lote invocada una vez y el orden de errores con dos fallos a la vez.
- Lecturas: medicion y comparacion de `.data` como en "Rendimiento de loaders". Mutaciones: si la base de desarrollo es compartida o su outbox envia correo real, se cuentan las sentencias por construccion en las pruebas, sin disparar acciones.
- Lo descartado (sin ganancia de fases, contradice una decision probada, requiere SQL crudo, presiona a un tercero) va al PR con su motivo.
```

**En "Checklist de salida del agente", nuevo punto:**

```markdown
10. Que todo caso de uso o repositorio nuevo o modificado no consulta por elemento, no encadena lecturas independientes ni escribe fila a fila dentro de transacciones; y que cada optimizacion conserva resultado, errores y su orden, alcance y forma, con pruebas que lo demuestran.
```
