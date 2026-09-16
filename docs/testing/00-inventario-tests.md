# Inventario de tests

Estado de la suite al 16 de septiembre de 2026. **188 archivos, 2207 tests, todos
en verde.** El runner es [Vitest](https://vitest.dev) (`vitest run`), configurado en
`vitest.config.ts` con entorno `node`, resolución de alias vía
`vite-tsconfig-paths` y descubrimiento sobre `app/**/__tests__/**/*.test.{ts,tsx}`.

Todo test vive en una carpeta `__tests__/` dentro del directorio de la capa que
prueba —nunca junto al archivo bajo prueba—, y el patrón de descubrimiento está
restringido a esa ubicación: un test mal colocado no se ejecuta. La regla completa
está en [AGENTS.md](../../AGENTS.md) ("Ubicación obligatoria de pruebas") y en
[reglas.md §12](../reglas.md).

| Comando | Qué hace |
|---|---|
| `bun run test` | Corrida única, sin watch. Es lo que ejecuta el hook `verify:push`. |
| `bun run test:watch` | Modo interactivo durante el desarrollo. |
| `bun run test:coverage` | Corrida única con reporte de cobertura (proveedor `v8`) y comprobación de umbrales. |

La suite no depende del `.env` del desarrollador: `vitest.config.ts` declara un
`test.env` con secretos deterministas, porque `env.server` valida y **lanza** al
importarse. Sin eso, la suite no correría en CI.

## Cobertura

| Métrica | Actual | Umbral que exige `test:coverage` |
|---|---:|---:|
| Statements | 98.5 % | 98 % |
| Branches | 95.9 % | 95 % |
| Functions | 99.0 % | 98 % |
| Lines | 99.1 % | 99 % |

Los umbrales van deliberadamente por debajo de lo alcanzado: el margen absorbe una
rama defensiva nueva sin bloquear un PR, pero un archivo entero sin tests sí tumba
la corrida.

Bajaron respecto al 99.7 / 98.8 / 100 / 99.9 anterior al retirar los módulos de
concesionaria: eran ~100 archivos con cobertura casi total y su peso tapaba los
huecos que ya había en `cloud/utils`. Cambió el denominador, no la calidad.

### Qué queda fuera del cómputo y por qué

`coverage.include` es `app/**/*.ts`, así que los componentes `.tsx` nunca han
entrado. Además se excluyen a propósito:

| Exclusión | Motivo |
|---|---|
| `app/**/*.types.ts`, `app/**/*.port.ts` | Solo tipos e interfaces: no hay código ejecutable que cubrir. |
| `app/routes.ts`, `app/**/routes.config.ts` | Manifiesto y declaración de rutas: datos, no lógica. |
| `app/**/hooks/**` | Hooks de React. Ejercitarlos exige jsdom y Testing Library, que no están en el proyecto. |
| `app/core/db.server.ts`, `app/shared/di/container.server.ts` | Composition root y cliente de Prisma: exigen integración real. |
| `app/shared/storage/{s3,gcs}.adapter.ts` | Adaptadores de SDK: se prueban contra el proveedor, no con dobles. |
| `app/modules/*/infrastructure/*.repository.server.ts` | Repositorios Prisma: exigen una base de datos. |

Cada exclusión es una decisión visible, no un truco para inflar el porcentaje: lo
que queda fuera está listado como hueco al final de este documento.

## Resumen por área

| Área | Archivos | Tests | Capas cubiertas |
|---|---:|---:|---|
| [Auth](#auth) | 23 | 274 | dominio, aplicación, infraestructura, rutas, utilidades |
| [Theme](#theme) | 13 | 360 | dominio, aplicación, infraestructura, rutas, utilidades |
| [Users](#users) | 20 | 258 | dominio, aplicación, rutas, utilidades |
| [Dependencies](#dependencies) | 17 | 159 | dominio, aplicación, infraestructura, rutas, utilidades |
| [Trainers](#trainers) | 16 | 100 | dominio, aplicación, rutas, utilidades |
| [Groups](#groups) | 14 | 74 | dominio, aplicación, rutas, utilidades |
| [Courses](#courses) | 16 | 186 | dominio, aplicación, rutas, utilidades |
| [Enrollments](#enrollments) | 11 | 124 | dominio, aplicación, rutas, utilidades |
| [Cloud](#cloud) | 7 | 88 | dominio, aplicación, rutas, utilidades |
| [Shared](#shared) | 42 | 486 | respuesta, reglas, storage, http, auth y alcance, logging, concurrencia, rate limit, layout |
| [Core](#core) | 2 | 35 | entorno y cookies |
| [Lib](#lib) | 6 | 61 | utilidades puras y zona horaria |
| **Total** | **188** | **2207** | |

> Las filas por área suman menos que el total: el inventario anterior ya iba un
> archivo y unos tests por detrás de la suite, y solo se han recontado las áreas
> que tocaron PRD-03 y PRD-04. El total sí es el que reporta el runner.

La distribución sigue reflejando la prioridad del proyecto: la superficie de
seguridad (epoch de validez, lockdown, rotación del refresh, autorización por
prefijo en storage) es la más ejercitada.

> A diferencia de versiones anteriores de este inventario, aquí no se transcribe
> cada nombre de test —serían 1021 líneas—. Se documenta, por archivo, **qué
> propiedad protege**. Los nombres exactos están en el propio código, que es donde
> no se desactualizan.

---

## Auth

Cubre las dos propiedades de seguridad documentadas en
[auth/02-revocacion-inmediata-epoch.md](../auth/02-revocacion-inmediata-epoch.md)
y [auth/03-lockdown.md](../auth/03-lockdown.md) —que revocar corte el acceso en
curso y que el lockdown cierre la puerta de entrada—, más el ciclo completo de
login, rotación y cierre de sesión.

### `domain/__tests__/` — 80 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `security-state.rules.test.ts` | 14 | `evaluateToken` contra el epoch global y el de usuario; precedencia del lockdown sobre los epochs; el fail-closed del token acuñado en el mismo segundo. `isLockedOutForRole` con los dos alcances y con el alcance **sin declarar**, que se trata como el más restrictivo. |
| `auth.rules.test.ts` | 28 | `verifiedAccessTokenPayloadSchema` **exige `iat` entero** (un token inevaluable se rechaza entero); el picklist de roles; las allowlists de `sortBy`/`status` del monitor; `lockdownRule` con su confirmación literal `"CERRAR"`. |
| `auth.validators.test.ts` | 16 | Los siete `validate*` lanzan con entrada inválida y devuelven el valor tipado con la válida. |
| `auth.mapper.test.ts` | 13 | `toSessionSummary` **no filtra `refreshTokenHash` ni `prevTokenHash`** —la razón de que el mapper enumere campos—; `isExpired`/`isCurrent`; el dueño `null` de una fila huérfana. |
| `auth.errors.test.ts` | 9 | Códigos estables; `details.retryAfterMs` de `TooManyAttemptsError`; que todos extienden `DomainError`; y que `PlatformLockedError` **no lleva detalles** (el motivo del cierre nunca viaja). |

### `application/__tests__/` — 80 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `auth.service.login.server.test.ts` | 18 | Rate limit por email y por IP con su `retryAfterMs`; el corte **antes** de bcrypt; el hash dummy que iguala el timing de un correo inexistente; que en la base se persiste el **hash** del refresh token; el cap de sesiones; `logout` idempotente. |
| `auth.service.refresh.server.test.ts` | 22 | Rotación compare-and-swap; reintento **único** ante `stale`; hit de gracia que devuelve `refreshToken: null`; reuso fuera de la ventana que revoca la familia entera; single-flight compartiendo una rotación entre concurrentes; el corte `except-admin` en las dos ramas que resuelven usuario. |
| `auth.service.server.test.ts` | 4 | El lockdown corta login y refresh; alcance `all` sin llamar a `compare`; `except-admin` que deja pasar a ADMIN y bloquea a USER tras el mismo bcrypt. |
| `token.service.server.test.ts` | 16 | Round-trip firmar/verificar; rechazo de otro secreto, otro issuer, otra audiencia, firma alterada y token expirado; un rol fuera de la tupla **no supera la verificación** aunque esté bien firmado; el token no transporta más claims que los declarados. |
| `session-monitor.service.server.test.ts` | 15 | Revocación y epoch (por sesión no lo toca, por usuario y global sí); dueños resueltos **deduplicados**; ningún hash llega a la respuesta; `revokeAllExceptCurrent` sin sesión que preservar no borra nada. |
| `security-state.service.server.test.ts` | 3 | `lockdown` transaccional una sola vez; `getState` nunca expone `lockdownReason`. |
| `password.service.server.test.ts` | 2 | Round-trip hash/compare y salt por hash. Deliberadamente cortos: bcrypt a coste 12 son ~250 ms por operación. |

### `infrastructure/__tests__/` — 10 tests

`security-state.cache.server.test.ts`: el TTL como único dial entre coste y
propagación; colapso de lecturas concurrentes; servir el último valor conocido
cuando la base cae (devolver "sin revocaciones" abriría la plataforma); y que las
cuatro mutaciones —`revokeAllTokens`, `revokeUserTokens`, `lockdown`, `lift`—
invalidan la caché.

### `routes/**/__tests__/` — 56 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `sesiones/index.action.test.ts` | 23 | El `switch` de las seis intenciones; guard `ADMIN` repetido en el action; el token de refresh que viaja **crudo** al servicio; la confirmación reforzada del lockdown; una intención desconocida no ejecuta nada. |
| `sesiones/index.loader.test.ts` | 12 | Guard; filtros del query string con sus defaults; basura y decimales descartados; corte con el status del código cuando el servicio falla. |
| `iniciar-sesion/index.action.test.ts` | 10 | Redirect con `Set-Cookie` en el éxito; IP validada y user-agent hacia el servicio; **un input inválido lee exactamente igual que unas credenciales incorrectas** (anti-enumeración). |
| `iniciar-sesion/index.loader.test.ts` | 4 | Quien ya tiene sesión no ve el formulario. |
| `cerrar-sesion/index.action.test.ts` | 4 | Se **devuelve** (no se lanza) la Response para que el navegador aplique los `Set-Cookie`; salir limpia y redirige aunque el borrado en servidor falle. |
| `cerrar-sesiones/index.action.test.ts` | 3 | El id sale de la sesión, nunca del formulario. |

### `utils/__tests__/` — 22 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `auth-error-messages.test.ts` | 11 | **La invariante anti-enumeración**: validación, credenciales, sesión inválida, sesión expirada y reuso comparten literalmente el mismo texto. `PLATFORM_LOCKED` no menciona incidente ni plazo. `TOO_MANY_ATTEMPTS` interpola redondeando hacia arriba. |
| `session-monitor-error-messages.test.ts` | 7 | Es explícito donde el de login es opaco a propósito (aquí quien lee ya es administrador); solo los códigos que un loader puede encontrar declaran `status`. |
| `session-monitor-form.test.ts` | 4 | Los valores de `SESSION_INTENTS` son estables y únicos: son el contrato del `switch`. |

---

## Theme

Cubre las dos fases: el modo claro/oscuro/sistema
([docs/theme/00-modo-oscuro.md](../theme/00-modo-oscuro.md)) y el theme builder
([docs/theme/01-theme-builder.md](../theme/01-theme-builder.md)).

### `domain/__tests__/` — 131 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `theme.rules.test.ts` | 52 | La **precedencia cookie → columna** (invertirla haría que la misma persona viera un tema en la landing y otro tras entrar); que el modo `system` emita **ambas** variantes tras un `@media` —es el test que protege la ausencia de flash—; que solo `dark` reciba la clase `.dark`; el **saneamiento** contra un valor capaz de cerrar `</style>`; el color math en OKLCH (incluido `none`, que deja el canal sin definir y produciría `NaN`); el contraste contra los valores conocidos de WCAG (21:1 y 4.5:1); que derivar oscuro no mande el blanco a negro puro; y las tres **invariantes de la biblioteca** —preset inmutable, activo no borrable, activar exige publicado— comprobando el `code`, nunca el mensaje. |
| `theme.mapper.test.ts` | 33 | El **round-trip** `parse(export(t))` sobre el tema base y los cuatro presets, fuentes y métricas incluidas; que `toCssTokenSet` recorra la allowlist y no las claves del objeto guardado, de modo que una fila corrupta no cuele nombres nuevos en el `<style>`; la tolerancia del parser (rellena lo que falta con el tema en edición, ignora fuentes fuera del catálogo y unidades que no acepta) y su **rechazo** cuando lo pegado no trae el mínimo de tokens; la versión del JSON comprobada antes que el contenido; y que `tokensEqual` no dependa del orden de las claves —si dependiera, "hay cambios sin publicar" se quedaría encendido para siempre. |
| `theme.validators.test.ts` | 31 | Que un modo inventado **muera en la frontera** y no acabe en la cookie; que el conjunto de 36 colores se exija completo; que un color se valide interpretándolo de verdad y no con una regex; las cotas de cada medida y de los seis parámetros de sombra; que solo se admitan fuentes del catálogo curado; y que la variante de LECTURA devuelva `null` en vez de lanzar. |
| `theme.errors.test.ts` | 15 | Los seis códigos son estables y únicos, todos extienden `DomainError` —si dejaran de hacerlo, `toResponseError` los daría por desconocidos— y los `details` dicen de qué tema hablan. |

### `application/__tests__/` — 47 tests

`theme.service.server.test.ts`: que `resolve` **no consulte la base** cuando la
cookie ya decide (corre en toda petición: el fallo sería de rendimiento y no lo
notaría nadie hasta producción); que degrade al tema base ante cualquier fallo de
lectura —el tema no es una decisión de seguridad—; y el punto de seguridad del
preview: **la cookie se ignora si el rol verificado en servidor no es ADMIN**.
Después, las once operaciones de la biblioteca con su envelope en éxito **y** en
fallo, verificando en cada rechazo que no se escribió nada.

### `infrastructure/__tests__/` — 16 tests

`theme.cache.server.test.ts`: que se sirva de memoria dentro del TTL y se relea
después; que la **ausencia** de tema activo se cachee igual (si `null` contara
como "no cargado", una plataforma sin tema activo pagaría una consulta por
petición para siempre); que las lecturas concurrentes colapsen en una sola;
que un fallo sirva el último valor conocido; y que un fallo **en frío se
propague** —a diferencia de la caché del estado de seguridad, aquí quien decide
degradar es el servicio—. Cada escritura invalida.

### `routes/**/__tests__/` — 54 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `personalizacion/index.action.test.ts` | 37 | El guard de ADMIN **repetido en el action** —un loader protegido no protege las mutaciones de su propia ruta—; que las diez intenciones validen en la frontera antes de tocar el caso de uso; y la mecánica de la cookie de preview: se guarda el borrador **antes** de encenderla, es `HttpOnly` y de sesión, y activar o borrar un tema la apaga en el mismo movimiento. |
| `personalizacion/index.loader.test.ts` | 12 | 403 para `USER` y redirect para anónimo; que el tema abierto salga de la URL y caiga al activo cuando el id ya no existe; y que una biblioteca vacía —seed sin correr— devuelva un estado vacío en vez de reventar. |
| `preferencia-tema/index.action.test.ts` | 5 | Que la cookie se emita **aunque falle** guardar en la cuenta (fallo degradado, no total) y que un modo inventado no llegue a emitirla. |

### `utils/__tests__/` — 3 tests

`parse-theme-form-data.test.ts`: un JSON roto devuelve `null` en vez de lanzar —
quien decide que la entrada es inválida es el validador de frontera, con el mismo
`code` que cualquier otro campo mal formado.

---

## Users

### `domain/__tests__/` — 69 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `user.access.rules.test.ts` | 21 | La jerarquía y el alcance. Lo que más importa: `scopeWhere` traduce el alcance vacío a un **predicado imposible y nunca a `{}`** —que sería "alcanza todo"—, `scopeWriteWhere` devuelve `null` porque el `where` de un `update` no admite `IN ()`, nadie otorga `DEPENDENCY_HEAD` desde el formulario, y `canManageUser` impide que un auxiliar administre a su titular **aunque compartan dependencia**. |
| `user.rules.test.ts` | 43 | Las ocho reglas del módulo. `safeUserSchema` **descarta `password`**; `updateUserRule` es parcial y no admite contraseña; `changePasswordRule` exige la actual y `adminResetPasswordRule` no; la allowlist de columnas ordenables no incluye ninguna sensible. |
| `user.validators.test.ts` | 15 | Los siete `validate*` del módulo. |
| `user.errors.test.ts` | 8 | Códigos estables; `details.reason` de `InvalidUploadError`; que todos extienden `DomainError` (si no, su código no viajaría en el envelope). |
| `user.mapper.test.ts` | 7 | `toDomain` **elimina la contraseña** de la fila cruda y descarta los campos que el esquema no declara. |
| `user.config.test.ts` | 6 | `USER_PHOTO_HINT` se **deriva** de `maxBytes`; el prefijo de las fotos corresponde a un prefijo público de storage; los defaults del listado caben bajo el tope compartido. |

### `application/__tests__/` — 21 tests

`users.service.server.test.ts`: la contraseña en claro **nunca llega al
repositorio**; `updatePhoto` rechaza tipo y tamaño con la misma política que el
cliente, falla si no hay bucket configurado y persiste la **referencia del proxy**
en vez de la URL del proveedor; el borrado permanente exige archivado previo.

Y, desde PRD-01, el aislamiento: cada método **reenvía el mismo alcance** a
`findAll` y a `count` —si solo se filtrara el listado, el total delataría cuentas
que no aparecen—; fuera de alcance responde `USER_NOT_FOUND` y no un permiso
denegado; sin rango responde `FORBIDDEN_SCOPE` y **sí** lo dice, porque el actor
ya conoce la cuenta; `archive` revoca epoch y sesiones; `changeDependency` escribe
bitácora con su autor, degrada al auxiliar y bloquea al titular tanto en
autoservicio como movido por un administrador.

### `routes/**/__tests__/` — 56 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `usuarios/index.action.test.ts` | 14 | archive / unarchive / delete con su copia; `documentId` validado antes del `switch`; una intención desconocida no muta nada; un fallo **no corta con status** (la pantalla sigue en pie). |
| `usuarios/index.loader.test.ts` | 11 | Guard que produce un 403 real y no un redirect; filtros de la URL con sus defaults; corte con el status del diccionario. |
| `perfil/index.action.test.ts` | 10 | El sujeto sale del **token**, nunca del formulario: un envío manipulado con otro `documentId` no mueve a nadie más. Una intención administrativa no se acepta desde el perfil. |
| `perfil/index.loader.test.ts` | 10 | Único punto del dashboard con `requireAuth` y sin rol; el nombre de la dependencia se resuelve por id interno para que una desactivada no aparezca como "sin dependencia". |
| `$documentId.editar/index.action.test.ts` | 13 | El **`intent` decide la operación**, no el conjunto de campos: dos formularios de la misma pantalla no pueden dispararse el uno al otro. Foto best-effort. |
| `$documentId.editar/index.loader.test.ts` | 5 | Un `documentId` malformado y un usuario inexistente terminan igual: un status del diccionario del módulo. |
| `nuevo/index.action.test.ts` | 10 | El archivo se separa **antes** de validar; la foto se sube contra el usuario recién creado; si falla la foto, el alta se da por buena. |
| `nuevo/index.loader.test.ts` | 3 | Cada ruta impone su propio guard. |

### `utils/__tests__/` — 31 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `to-user-rows.test.ts` | 12 | El id numérico se **sustituye** por `documentId`: la PK interna no viaja al cliente. |
| `user-error-messages.test.ts` | 9 | Cubre todos los códigos del módulo; `DUPLICATE_EMAIL` cuelga el error del campo `email` y declara 409. |
| `parse-user-form-data.test.ts` | 6 | Separa la foto de los campos de texto; descarta un archivo que llegue bajo otra clave. |
| `build-user-form-defaults.test.ts` | 4 | Mapeo del usuario y alta en blanco. |

---

## Dependencies

17 archivos, 159 tests. Módulo nuevo del PRD-01: las unidades organizativas y la
designación de sus titulares.

### `domain/__tests__/` — 57 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `dependency.rules.test.ts` | 21 | Las cinco reglas del módulo. El nombre se **recorta antes de validar**, o "Obras" con espacio delante y sin él serían dos unidades que la columna `@unique` acepta por separado; las allowlists de orden y estado; los dos identificadores de `assignHeadRule` son públicos. |
| `dependency.errors.test.ts` | 20 | El `code` estable de cada error y que todos extienden `DomainError` —si no, su código no viajaría en el envelope—. Que `HEAD_MUST_BELONG` y `HEAD_MUST_BE_ACTIVE` sean **distintos**: uno se resuelve dando de alta a la persona, el otro restaurando su cuenta. |
| `dependency.validators.test.ts` | 10 | Los cinco `validate*`, incluida la validación de frontera del `documentId` de la URL. |
| `dependency.mapper.test.ts` | 5 | `toDomain` parsea contra el esquema en vez de copiar campo a campo: una fila corrupta se caza al mapearla y no tres capas más arriba. |
| `dependency.config.test.ts` | 1 | Los defaults del listado son fuente única del loader, el servicio y el repositorio. |

### `application/__tests__/` — 24 tests

`dependencies.service.server.test.ts`. El grueso es `assignHead`, que es la
operación delicada: **degrada al titular actual antes de promover** al candidato
—al revés el índice único parcial dispararía a mitad de transacción—, revoca los
tokens de **los dos** afectados y fuera del commit, rechaza a quien no pertenece
a la dependencia y a quien está archivado, no escribe nada si el candidato ya es
titular, y propaga el rechazo del índice con su copia propia.

El resto: `listActive` no lleva paginación porque es un catálogo y no una página;
`listHeadCandidates` falla con `NOT_FOUND` si la dependencia no existe en vez de
devolver una lista vacía, que en pantalla se leería como "no tiene personal".

### `infrastructure/__tests__/` — 7 tests

`dependencies.repository.server.test.ts`. Los repositorios están excluidos de la
cobertura, pero la **traducción de errores no**: es la única parte del archivo con
lógica propia y la que rompería en silencio. Un P2002 puede ser el nombre
duplicado **o el índice único parcial del titular**, y se distinguen por
`meta.target` porque el mensaje es por completo distinto: sin esto, designar un
segundo titular respondía "ese nombre ya existe". Lo que no se sabe traducir se
propaga tal cual, en vez de esconder un fallo real detrás de una copia
tranquilizadora.

### `routes/**/__tests__/` — 46 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `dependencias/index.loader.test.ts` | 12 | **Criterio de aceptación 3 del PRD**: un titular recibe 403 con `requiredRoles: ["SUPERADMIN"]` y no llega al servicio. Ningún rol salvo el superadministrador entra. Filtros de la URL con sus defaults. |
| `$documentId.editar/index.action.test.ts` | 10 | **Criterio 7**: designar un segundo titular responde con su copia propia y no con la del nombre duplicado. El recurso lo fija la URL: un `documentId` en el formulario se ignora. |
| `dependencias/index.action.test.ts` | 9 | Desactivar y restaurar con su copia; el guard se repite en el action; una intención desconocida no muta nada. |
| `nueva/index.action.test.ts` | 6 | El nombre se recorta antes de crear; unas siglas vacías no se guardan como cadena vacía; el nombre duplicado cuelga el error de **su** campo. |
| `$documentId.editar/index.loader.test.ts` | 6 | La dependencia y sus candidatos en paralelo; un `documentId` que no es uuid corta antes del servicio. |
| `nueva/index.loader.test.ts` | 3 | Cada ruta impone su propio guard. |

### `utils/__tests__/` — 25 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `dependency-error-messages.test.ts` | 8 | Cubre **todos** los códigos del módulo —si faltara uno, ese fallo llegaría como "error inesperado" y perdería la única pista de cómo resolverlo—; ninguna copia filtra el mensaje técnico. |
| `to-dependency-rows.test.ts` | 7 | El id numérico se **sustituye** por `documentId`: la PK interna no viaja al cliente. |
| `parse-dependency-form-data.test.ts` | 6 | Descarta los campos vacíos: para un campo opcional "" es ausencia, no valor. |
| `build-dependency-form-defaults.test.ts` | 4 | Ningún campo queda `undefined`, o `isDirty` dejaría de ser fiable y el aviso de cambios sin guardar con él. |

---

## Trainers

Catálogo de capacitadores (PRD-02). Lo que estas pruebas protegen es la excepción
del módulo: **es la única lista sin recorte por dependencia**, y a cambio sus
mutaciones sí llevan alcance.

### `domain/__tests__/` — 45 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `trainer.access.test.ts` | 9 | Que `canViewCatalog` deje pasar a un participante **con perfil** y corte a uno sin él —la condición que `requireRole` no sabe expresar—, y que sobre un externo mande el rol y no el alcance, porque no pertenece a ninguna dependencia. |
| `trainer.rules.test.ts` | 17 | Que la especialidad sea obligatoria, que la institución solo exista para externos, que la regla de activación no declare institución y que la de alta externa no declare dependencia ni número de empleado —el CHECK los prohíbe—. Y la allowlist de orden, que acaba en un `orderBy`. |
| `trainer.errors.test.ts` | 2 | El `code` estable de cada error y que todos desciendan de `DomainError`, que es lo que deja viajar el código en el envelope. |
| `trainer.mapper.test.ts` | 3 | Que el join se aplane en la frontera y que un externo salga sin dependencia, con su institución en su lugar. |
| `trainer.validators.test.ts` | 2 | Que devuelvan el dto parseado y que lancen `ValiError` para que `parseInput` lo convierta en la rama de validación. |
| `trainer.config.test.ts` | 2 | Los defaults de paginación y que los contadores pendientes nazcan vacíos (`0` / `null`), no inventados. |

### `application/__tests__/` — 20 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `trainers.service.server.test.ts` | 20 | Que `list` **no reciba ningún `AccessScope`**; que activar y desactivar revoquen los tokens y que un fallo al revocar no tumbe la operación; que un titular no active el perfil fuera de su dependencia y sí sobre un externo; que `createExternal` corra dentro de `runInTransaction` y **no cree la cuenta si el perfil falla**; y que el choque de correo se traduzca al código del catálogo. |

### `routes/**/__tests__/` — 26 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `capacitadores/index.loader.test.ts` | 12 | Que un participante con perfil entre y uno sin él reciba 403; que el modo consulta no pida candidatos; y que los candidatos de activación lleguen acotados al alcance del actor. |
| `capacitadores/index.action.test.ts` | 7 | Que el guard del action sea **por rol** aunque el del loader no lo sea: ver el catálogo y modificarlo son permisos distintos. |
| `nuevo/index.action.test.ts` | 4 | Que sin institución no se llegue al servicio y que el correo duplicado vuelva marcando su campo. |
| `$documentId.editar/index.loader.test.ts` | 4 | Que la ficha exija rol de gestión y valide el parámetro de la URL antes de consultar. |
| `$documentId.editar/index.action.test.ts` | 5 | Que la incoherencia de institución vuelva al campo y que un documentId inválido no llegue al servicio. |

### `utils/__tests__/` — 9 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `to-trainer-rows.test.ts` | 4 | Que la fila se identifique por el `documentId` de la **cuenta** —el perfil no tiene uno propio— y que la procedencia sea la dependencia o la institución según el tipo. |
| `trainer-error-messages.test.ts` | 3 | Que el diccionario cubra todos los códigos del módulo y tenga su entrada de reserva. |
| `build-trainer-form-defaults.test.ts` | 2 | Que ningún campo quede `undefined`, que es lo que hace fiable a `isDirty`. |

---

## Groups

Listas nominales por dependencia (PRD-02). Lo que estas pruebas protegen es la
regla central del módulo: **los candidatos se filtran por la dependencia DEL
GRUPO, nunca por la de quien administra**.

### `domain/__tests__/` — 24 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `group.access.test.ts` | 6 | Que `self` y `none` den un predicado imposible al leer y `null` al escribir —jamás `{}`, que sería acceso a todo— y que solo el alcance de dependencia pueda escribir. |
| `group.rules.test.ts` | 10 | Que el nombre se recorte antes de validarse, que la regla de creación **no declare dependencia** —la pone el alcance— y que un lote de miembros vacío no pase. |
| `group.errors.test.ts` | 2 | El `code` estable de cada error y su herencia de `DomainError`. |
| `group.validators.test.ts` | 2 | Que devuelvan el dto parseado y que lancen cuando el dato no cumple. |
| `group.mapper.test.ts` | 2 | Que el conteo de miembros y el nombre de la dependencia se aplanen en la frontera. |
| `group.config.test.ts` | 2 | Los defaults de paginación y el tope del selector de miembros. |

### `application/__tests__/` — 15 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `groups.service.server.test.ts` | 15 | Que `findAll` y `count` reciban **el mismo alcance**; que un alcance global lea y **no escriba** —es el superadministrador—; que la dependencia del grupo salga del alcance y no del dto; que una dependencia archivada no admita grupos nuevos; y que `addMembers` consulte la elegibilidad contra la dependencia del GRUPO y **rechace el lote entero** si alguna cuenta no cumple. |

### `routes/**/__tests__/` — 23 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `grupos/index.loader.test.ts` | 11 | Que el alcance llegue al servicio, que el superadministrador entre en modo consulta y que un titular sin dependencia se traduzca a `{kind:"none"}` sin administrar nada. |
| `grupos/index.action.test.ts` | 4 | Que un alcance que no administra vuelva con la copia del módulo y no con un 403: el corte lo da el servicio, no el guard. |
| `$documentId.editar/index.action.test.ts` | 8 | Que el alta mande **todos** los identificadores del envío —quedarse con el último dejaría el grupo con un solo miembro sin avisar— y que el nombre duplicado vuelva marcando su campo. |

### `utils/__tests__/` — 12 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `parse-group-form-data.test.ts` | 4 | Que conserve **todas** las claves repetidas, que es lo que distingue a este parser del de los demás módulos. |
| `to-group-rows.test.ts` | 3 | Que la fila se identifique por `documentId` y que el nombre de un miembro caiga a su correo. |
| `group-error-messages.test.ts` | 3 | Cobertura de códigos y entrada de reserva. |
| `build-group-form-defaults.test.ts` | 2 | Que ningún campo quede `undefined`. |

---

## Courses

Cursos, sesiones y acceso (PRD-03). Lo que estas pruebas protegen es que **el
alcance de autor del capacitador interno no se convierta en nada ni en todo**, y
que un curso no se publique sin lo que §6.5 exige.

### `domain/__tests__/` — 116 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `course.access.test.ts` | 36 | Que un capacitador interno con rol `USER` resuelva a `creator` y el externo a `none`; que `none` dé un predicado imposible al leer y `null` al escribir, jamás `{}`; que fuera del alcance global la organizadora **ignore la del formulario**; que un curso por invitación solo se abra por invitación o inscripción propia; y qué ve una dependencia completa al asignar. |
| `course.rules.test.ts` | 27 | Las cuatro condiciones de publicación, que el error diga **qué sesión** falló, las transiciones de estado, que un borrador sin sesiones sea válido y que el cupo no baje de los inscritos. |
| `course.errors.test.ts` | 22 | El `code` estable de cada error, su herencia de `DomainError` y los `details` que el adaptador interpola. |
| `course.validators.test.ts` | 21 | Contratos de frontera: horas `HH:mm`, uuid en la URL, allowlist de ordenación, y que la edición descarte la organizadora. |
| `course.mapper.test.ts` | 7 | Que el rango de fechas y los conteos se aplanen sin inventar fechas, y que `isActive` del capacitador se derive de cuenta y perfil. |
| `course.config.test.ts` | 3 | Defaults de paginación, asistencia mínima y tope de sesiones. |

### `application/__tests__/` — 28 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `courses.service.server.test.ts` | 28 | Envelope en éxito y fallo de `create`, `update`, `publish` y `cancel`; que `create` y `update` corran en `runInTransaction`; que la hora de Tijuana llegue a UTC; que un lote con un capacitador o audiencia no disponible **se rechace entero**; que un curso no restringido descarte su audiencia; que un finalizado o cancelado no se edite; y que editar el cupo bloquee el curso y no baje de los inscritos. |

### `routes/**/__tests__/` — 24 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `cursos/index.loader.test.ts` | 6 | 403 al participante y al externo; alcance de autor al capacitador interno; que un titular no pueda pedir otra dependencia por la URL. |
| `cursos/index.action.test.ts` | 5 | Publicar y cancelar por `documentId`, uuid validado antes del servicio, y copia del módulo en vez de un status. |
| `cursos/nuevo/index.action.test.ts` | 5 | Que el JSON del curso conserve sus tipos, que un JSON roto se rechace como validación y que los errores vuelvan por campo. |
| `$documentId.editar/index.loader.test.ts` | 4 | Permisos derivados del estado y **404 fuera de alcance**: ni por URL directa. |
| `$documentId.editar/index.action.test.ts` | 4 | Guardar con el `documentId` de la URL y publicar desde la ficha. |

### `utils/__tests__/` — 18 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `build-course-payload.test.ts` | 5 | Que la regla del formulario sea la del servidor y que sus errores conserven el nombre del campo (`sessions.0.startTime`). |
| `build-course-form-defaults.test.ts` | 4 | Ningún campo `undefined` y que las horas precargadas vuelvan a la zona del instituto. |
| `parse-course-form-data.test.ts` | 4 | Que el payload JSON se decodifique con sus tipos y que uno roto llegue como `null`. |
| `course-error-messages.test.ts` | 4 | Cobertura de códigos, reserva, y que la copia nombre la sesión. |
| `to-course-rows.test.ts` | 1 | Que la PK interna no llegue a la tabla. |

---

## Enrollments

Inscripción e invitaciones (PRD-04). Lo que estas pruebas protegen es que **nadie
entre sin cupo ni vea un curso por invitación sin estar invitado**, y que cada
escritura respete la máquina de estados de la fila única por persona y curso.

### `domain/__tests__/` — 62 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `enrollment.rules.test.ts` | 36 | Cierre por fecha límite o primera sesión, baja hasta que empieza, quién cursa (externos y roles globales no), cupo que falla con los lugares restantes, la tabla de transiciones y la clasificación de "Mis cursos". |
| `enrollment.errors.test.ts` | 14 | El `code` estable de cada error, su herencia y los `details` serializables. |
| `enrollment.validators.test.ts` | 7 | uuid, modalidad permitida, lote de asignación no vacío e invitación con al menos una persona o grupo. |
| `enrollment.mapper.test.ts` | 5 | Rango de sesiones, lugares restantes y que la lista use la dependencia con la que se inscribió. |

### `application/__tests__/` — 30 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `enrollments.service.server.test.ts` | 30 | Envelope en éxito y fallo de `enroll`, `withdraw`, `accept`, `decline`, `assign` e `invite`; que el cupo se cuente **con el curso bloqueado dentro de la transacción**; que reinscribirse reutilice la fila; asignación todo o nada y solo con personal de la dependencia; que invitar expanda grupos, deduplique, omita activos y reinvite a quien rechazó; que un curso no visible responda como inexistente; y los permisos del detalle. |

### `routes/**/__tests__/` — 23 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `cursos-disponibles/index.loader.test.ts` | 3 | Filtros del query string y 403 al externo y al superadministrador. |
| `cursos-disponibles/$documentId/index.loader.test.ts` | 3 | **404 por URL directa** y que solo quien puede asignar reciba candidatos. |
| `cursos-disponibles/$documentId/index.action.test.ts` | 7 | Intents por `documentId` validado, copia del módulo sin status, resumen del lote y 403 al externo. |
| `mis-cursos/index.action.test.ts` | 4 | Aceptar y rechazar con el curso del formulario y las cuatro listas del loader. |
| `inscripciones/index.test.ts` | 6 | 403 al participante sin perfil, acceso del capacitador interno, sin opciones con la inscripción cerrada y resumen de invitados y omitidos. |

### `utils/__tests__/` — 9 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `enrollment-utils.test.ts` | 9 | Copia para cada código con su status de loader, redacción de lotes, nombre de respaldo y lectura de listas repetidas del formulario. |

---

## Cloud

Gestor de nube (`/dashboard/nube`). Lo que estas pruebas protegen es que el
árbol unificado sobre **dos buckets** no confunda uno con otro, y que el borrado
en cascada suelte la referencia en la base **antes** de tocar ningún objeto.

### `domain/__tests__/` — 37 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `cloud.paths.test.ts` | 20 | Las migas de la raíz a la carpeta actual, la carpeta común de una selección —y que un segmento que solo *empieza* igual no cuente como común— y que el cursor compuesto conserve el token de cada bucket en la ida y la vuelta. |
| `cloud.rules.test.ts` | 17 | Que una carpeta acabe en `/`, que **el path traversal se rechace**, que la raíz no se pueda seleccionar como carpeta y que el lote tenga tope. |

### `application/__tests__/` — 22 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `cloud.service.server.test.ts` | 22 | Que la raíz fusione los dos buckets sin colar lo que está en el equivocado; que un cursor inventado sea un error tipado y no un 500; que un ZIP demasiado grande se rechace **antes de firmar nada**; que el borrado suelte la referencia en la base y solo después borre en cada bucket —**si soltarla falla, no se borra ningún objeto**—; y que sea huérfano solo lo que no tiene referencia y ya pasó la ventana de gracia. |

### `routes/**/__tests__/` — 14 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `nube/index.loader.test.ts` | 6 | Que un rol insuficiente corte con 403 **antes de listar**, que una ruta con `..` sea un 400 y no un listado, y que sin storage configurado se pinte la pantalla vacía en vez de un error. |
| `nube/index.action.test.ts` | 8 | Que una selección con la raíz o con `..` no llegue al servicio, que el borrado pase quién borra, y que los fallos salgan con copia de usuario y su código. |

### `utils/__tests__/` — 15 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `cloud-format.test.ts` | 7 | La escala de `formatBytes` de bytes a gigabytes, y que el plural elija forma por la cantidad. |
| `to-cloud-rows.test.ts` | 8 | Que las carpetas vayan primero y sin duplicados entre páginas, que la ruta se codifique, y que la frase de confirmación pida el nombre de la carpeta cuando hay una sola. |

---

## Shared

### `response/__tests__/` — 30 tests

`response.helpers.test.ts` (12), `response.messages.test.ts` (12) y
`run-operation.test.ts` (6). El contrato del envelope de punta a punta: `ok`/`fail`,
`toPaginationMeta` que nunca deja "página 1 de 0", la normalización de errores con
su regla no negociable —**el mensaje de un error no tipado nunca viaja al
cliente**—, `localizeError`/`failFrom`, y el runner que registra los conocidos en
`debug` y los inesperados en `error` con su mensaje real.

### `rules/__tests__/` — 42 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `response.rules.test.ts` | 15 | La unión discriminada rechaza estados imposibles (`{ success: true, error }`); ningún código transversal es un status HTTP. |
| `atoms.rules.test.ts` | 13 | `hasRole`; el cap de 72 caracteres de bcrypt (sin él, `password + basura` autenticaría por truncamiento); el picklist de roles. |
| `list.rules.test.ts` | 9 | `page >= 1` y el tope de `pageSize`, que es la defensa contra un `?pageSize=100000`. |
| `format-vali-error.test.ts` | 5 | Primer mensaje por campo; las incidencias **sin path se descartan**. |

### `storage/__tests__/` — 100 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `storage.transaction.test.ts` | 19 | Commit conserva las keys; un throw revierte **todas** las subidas y **re-lanza el error original**; `uploadMany` valida el lote entero antes de subir nada; un fallo parcial lanza `StorageBatchError` y revierte; un rollback fallido registra las keys huérfanas. |
| `storage.route.test.ts` | 17 | **Autorización por prefijo**: una key privada sin sesión redirige a login sin tocar el proveedor. Cap del modo inline (413); tipo desconocido servido como binario opaco; el mensaje del proveedor nunca viaja al cliente. |
| `storage.factory.test.ts` | 13 | Selección de proveedor y armado del config desde `Env`; los flags booleanos solo se activan con el literal `"true"`. |
| `object-key.test.ts` | 11 | `sanitizeFileName` neutraliza separadores de ruta y `..` (**path traversal**); `.gitignore` tratado como nombre sin extensión. |
| `upload-validation.test.ts` | 11 | Archivo vacío, allowlist de tipos, tope de tamaño; una allowlist vacía no deja pasar nada. |
| `storage.errors.test.ts` | 10 | Códigos estables, `details` serializables, y que ambos son `DomainError`. |
| `mime.test.ts` | 7 | Tipo por extensión; fail-safe a `application/octet-stream` (adivinar `text/html` sobre un archivo subido sería un XSS almacenado). |
| `storage.utils.test.ts` | 7 | `getKeyFromUrl` con el formato proxy, la key cruda y el rechazo de una URL completa del proveedor. |
| `storage.policy.test.ts` | 5 | Prefijos públicos con `startsWith`; **fail-closed** por defecto. |

### `http/__tests__/` — 31 tests

| Archivo | Tests | Qué protege |
|---|---:|---|
| `route-error.test.ts` | 12 | `isForbiddenRoleError` **distingue** el 403 de `requireRole` del 403 de Origin no confiable; la precedencia de status y el `statusText` explícito (sin él, un 404 se pinta como error interno). |
| `origin.test.ts` | 10 | Defensa CSRF: sin header se permite (clientes no-navegador), `"null"` se rechaza, un host distinto se rechaza. |
| `client-ip.test.ts` | 9 | Primer elemento de `X-Forwarded-For`, validación de formato y caída a `CF-Connecting-IP`: ninguna IP arbitraria se persiste. |

### `logging/__tests__/` — 17 tests

`logger.console.test.ts`: filtrado por umbral, bindings encadenables, y sobre todo
la **redacción** de claves sensibles, incluso anidadas — un log acaba en stdout de
un contenedor y en un agregador de terceros.

### `auth/__tests__/` — 12 tests

`require-role.server.test.ts` (8) y `require-auth.server.test.ts` (4): sin sesión
se redirige a login (un 403 le diría a un anónimo que el recurso existe); con
sesión pero sin rol se corta con un 403 que conserva la URL; el `AuthContext` no
arrastra los claims crudos.

### `layout/__tests__/` — 29 tests

`navigation.utils.test.ts` (10), `navigation.config.test.ts` (13) y
`routes/__tests__/dashboard.layout.loader.test.ts` (6): un grupo sin destino propio
que se queda sin hijos desaparece entero; el gate del layout es **estructural**; la
proyección al cliente no incluye la PK interna.

### `concurrency/` y `rate-limit/__tests__/` — 14 tests

`single-flight.memory.test.ts` (7): dedup dentro del TTL y **los rechazos no se
cachean**. `rate-limiter.memory.test.ts` (7): bloqueo en `limit + 1`, ventana que
se reinicia, claves independientes.

### `errors/__tests__/` — 7 tests

`domain-error.test.ts`: `isDomainError` **rechaza un errno de Node** con `code`
(`ECONNREFUSED`). Es la invariante que justifica la clase base: sin ella, el
mensaje de un error de infraestructura viajaría al cliente.

---

## Core

| Archivo | Tests | Qué protege |
|---|---:|---|
| `env.server.test.ts` | 12 | El proceso **no arranca** con un secreto ausente o débil; el mensaje enumera todas las variables incumplidas; la validación condicional al proveedor de storage; los defaults. |
| `cookies.server.test.ts` | 12 | Round-trip serializar/parsear; `refreshToken: null` emite **una sola** cookie (el hit de gracia); `HttpOnly` y `SameSite=Lax` en ambas; una cookie manipulada no se acepta. |

---

## Lib

| Archivo | Tests | Qué protege |
|---|---:|---|
| `string-utils.test.ts` | 18 | Las tres formas de truncar y la normalización sin diacríticos; `null`/`undefined` → `""`. |
| `form-data.test.ts` | 9 | `File[]` bajo la misma clave; `null`/`undefined` **omitidos** —el servidor no distingue "no enviado" de "borrar"—; `0` y `""` sí viajan. |
| `password-generator.test.ts` | 6 | Garantía de mayúscula y dígito sobre 100 generaciones; el caso límite de `length < 2`. |
| `utils.test.ts` | 5 | `cn` resolviendo conflictos de Tailwind. |
| `date-utils.test.ts` | 11 | Desfase de 7 horas en verano y de 8 en invierno, el día del cambio de horario, y la ida y vuelta formulario ↔ UTC. |

---

## Huecos conocidos

- **Sin tests de componentes.** No hay `jsdom` ni Testing Library en el proyecto;
  toda la suite es lógica en entorno `node`. Los componentes `.tsx` y los hooks de
  React (`app/shared/hooks/`, `app/modules/users/hooks/`,
  `app/modules/theme/hooks/`) no están cubiertos y quedan fuera del cómputo de
  cobertura. El hueco más caro hoy es el del theme builder: el picker OKLCH y el
  preview en vivo son `.tsx` y solo se comprueban a mano. Los loaders y actions **sí** lo están: se
  ejercitan con un cradle falso y `Request` estándar, sin levantar el framework.
- **Sin tests de integración contra la base.** Los repositorios Prisma
  (`app/modules/*/infrastructure/*.repository.server.ts`) se ejercitan solo a
  través de dobles en los tests de aplicación. Falta el contract test que
  [reglas.md §12](../reglas.md) exige para los adaptadores.
- **Adaptadores de storage sin integración.** `s3.adapter.ts` y `gcs.adapter.ts`
  solo se cubren indirectamente: `storage.factory.test.ts` verifica qué config
  reciben, no que hablen correctamente con el proveedor. El resto del subsistema
  —transacción, política, keys, MIME y el proxy— sí tiene cobertura completa.
- **Composition root sin cobertura.** `container.server.ts` cablea el contenedor y
  ejecuta el silent refresh por petición; probarlo de verdad exige levantar una
  petición completa contra una base real.

## Hallazgos resueltos

- **`atoms.email` recortaba en el sitio equivocado.** El pipe era
  `v.string() → v.email() → v.transform(trim + lowercase)`, así que el `.trim()`
  corría **después** de validar el formato y nunca llegaba a actuar sobre
  espacios: `" ana@empresa.com "` se rechazaba en vez de normalizarse. Importaba
  porque en el login cualquier fallo de validación se responde con
  "Credenciales inválidas." (genérico a propósito, para no filtrar enumeración de
  cuentas), de modo que un espacio pegado desde el gestor de contraseñas daba un
  error indescubrible. Resuelto moviendo el trim delante de `v.email()`, que es
  además el idioma que ya usaba el repo en `app/shared/http/client-ip.ts`
  (`v.pipe(v.string(), v.trim(), v.ip())`). Cubierto en
  `app/shared/rules/__tests__/atoms.rules.test.ts`, con un test que fija que el
  recorte es solo exterior: los espacios internos siguen fallando.
