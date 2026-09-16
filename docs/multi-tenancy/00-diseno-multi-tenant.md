# Multi-tenancy — Diseño y guía de implementación

**Última actualización:** 2026-07-14 · Este documento describe **qué se necesita
y por qué** para que la plantilla sirva por igual a un **SaaS multi-tenant**
(varias concesionarias) y a un **proyecto a la medida de un solo tenant**, más su
**implementación conceptual** y la **infraestructura fuera de la app**.

A diferencia de [auth/00](../auth/00-sistema-autenticacion.md), que documenta algo
*ya implementado*, este documento es de **diseño**: fija las decisiones y el plano
de trabajo antes de escribir código, porque la tenancy es la única pieza que toca
el **dominio** y es cara de retrofitear.

---

## 1. El problema y el objetivo

Hoy la plantilla es una app **single-tenant**: un despliegue, una base de datos,
un conjunto de usuarios. El objetivo es que la **misma base de código** soporte:

- **Modo SaaS (multi-tenant):** varias concesionarias, cada una aislada de las
  demás, con su propio dominio (`www.concesionariaa.com`, `www.concesionariab.com`).
  Todas se registran y pagan en `cardealership.com`; al activar la suscripción
  se les provisiona acceso a la herramienta.
- **Modo a la medida (single-tenant):** un cliente, un despliegue, una base —
  el comportamiento actual, sin sobrecoste conceptual.

El requisito duro del SaaS: **las concesionarias no se conocen entre sí** y, en lo
posible, **cada una tiene su propia base de datos**.

La tesis de este diseño: eso **no** exige una instancia de aplicación por cliente.
Se resuelve con **una sola aplicación multi-tenant** que **resuelve el tenant por
dominio** y **aísla los datos a nivel de base de datos**. El *cómputo* se comparte;
los *datos* se aíslan.

## 2. Concepto central: dos planos

La distinción que gobierna todo el diseño:

| Plano | Vive en | Qué contiene | Cardinalidad |
|---|---|---|---|
| **Control plane** (plano de control) | `cardealership.com` | Registro de tenants, dominios, estado de suscripción/billing, el embudo de alta | **Una** base compartida |
| **Data plane** (plano de datos / app) | `www.concesionariaX.com` | Usuarios, sesiones, y los datos de negocio de esa concesionaria — **el schema actual** | **Una base por tenant** |

Leído al revés: **la app actual es el data plane de UN tenant.** Volverla
multi-tenant no reescribe la app — añade **un control plane nuevo** y **una capa
de resolución de tenant** que decide, en cada petición, contra qué base de datos
trabaja la app.

```
                         ┌──────────────────────────────┐
   registro + pago  ───► │  CONTROL PLANE                │   1 base compartida
   cardealership.com     │  tenants, domains, billing    │   (registro, no datos de negocio)
                         └──────────────┬────────────────┘
                                        │ provisiona / resuelve
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                          ▼
      ┌───────────────┐        ┌───────────────┐          ┌───────────────┐
      │ Tenant A DB   │        │ Tenant B DB   │   ...    │ Tenant N DB   │   1 base por tenant
      │ users/sesiones│        │ users/sesiones│          │ users/sesiones│   (el schema actual)
      └───────────────┘        └───────────────┘          └───────────────┘
              ▲                         ▲                          ▲
      www.concesionariaa.com    www.concesionariab.com     ...
              └─────────────────────────┴──────────────────────────┘
                        UNA sola aplicación (cómputo compartido)
```

## 3. Modelos de aislamiento y recomendación

El espectro clásico de tenancy, de menos a más aislamiento:

| Modelo | Cómputo | Datos | Coste/Ops | Aislamiento | "Ruido" entre vecinos |
|---|---|---|---|---|---|
| **Pool** (compartido total) | 1 app | 1 base, columna `tenantId` + RLS | Mínimo | Lógico (depende de disciplina/RLS) | Alto |
| **Bridge — schema por tenant** | 1 app | 1 base, un *schema* Postgres por tenant | Bajo | Medio-alto | Medio |
| **Bridge — base por tenant** | **1 app** | **1 base por tenant** | Medio | **Alto** | Bajo |
| **Silo — instancia por tenant** | **1 app por tenant** | 1 base por tenant | **Alto** | Máximo | Nulo |

### 3.1 Veredicto

**Recomendado: Bridge con base de datos por tenant.** Una sola aplicación
(cómputo compartido) que resuelve el tenant por dominio y se conecta a la base de
ese tenant. Es exactamente lo que pediste — *"cada uno con su propia base"* — sin
el coste del modelo silo.

**Descartado: instancia por tenant (silo de cómputo).** Es la peor opción
operativa para este caso:

- **N despliegues, N pipelines de CI/CD, N configuraciones** que mantener y
  actualizar en sincronía. Un bug fix = N releases.
- **Cómputo desperdiciado:** una concesionaria pequeña con 3 usuarios mantiene un
  proceso/contenedor entero ocioso. No se comparte nada.
- **No aporta aislamiento extra real** frente a "base por tenant": el aislamiento
  fuerte que te importa es el de **datos**, y ese ya lo da la base separada. El
  aislamiento de *cómputo* solo importa en escenarios de cumplimiento muy
  estrictos (aislamiento físico contractual) o "tenants gigantes" que justifican
  su propio hardware — no el alta masiva de concesionarias.
- El onboarding deja de ser "crear una fila + una base" y pasa a ser "desplegar
  una app", lo que rompe el auto-servicio (registrarse y pagar en segundos).

> **Regla práctica:** aísla los **datos**, comparte el **cómputo**. Sube al modelo
> silo solo para un tenant concreto que lo exija (contrato/escala), como excepción,
> no como norma.

### 3.2 Por qué "base por tenant" y no las alternativas más baratas

- **Frente a Pool (columna `tenantId`):** el modelo pool es el más barato y
  eficiente en conexiones, pero **todo el aislamiento depende de que cada consulta
  filtre por `tenantId`** (y de activar Row-Level Security como red). Un `WHERE`
  olvidado = fuga de datos entre concesionarias. Con base por tenant, **un olvido
  no puede filtrar datos de otro tenant**: físicamente no están en la misma base.
  Para un producto donde "no se conocen entre sí" es un requisito de venta, la base
  por tenant elimina toda una clase de bugs de fuga.
- **Frente a Schema por tenant:** el schema por tenant comparte una sola base y un
  solo pool de conexiones (mejor a gran escala en número de tenants), pero el
  aislamiento es más débil (un fallo de permisos o un `search_path` mal puesto
  cruza schemas) y **Prisma modela mal el schema dinámico** — quiere los schemas
  conocidos al generar el cliente. La base por tenant encaja mejor con Prisma
  (`@prisma/adapter-pg` ya está en el proyecto: basta un `pg.Pool` por tenant con
  su connection string — ver §5.2).

### 3.3 La decisión reversible

Lo importante: **si la resolución de tenant es un puerto** (§5), moverte por el
espectro **no toca el dominio ni la lógica de negocio**. Puedes empezar con base
por tenant y, si el número de tenants crece tanto que las conexiones duelen,
introducir un adaptador de "schema por tenant" o "pool + RLS" para el segmento de
tenants pequeños — sin reescribir servicios ni repositorios. Diséñalo para poder
cambiar de opinión.

## 4. Modelo de dominios y autenticación

### 4.1 Reparto de responsabilidades por dominio

- **`cardealership.com` = control plane.** Marketing, registro (signup), pago de
  la suscripción, y el panel de "mis concesionarias" del dueño de la cuenta. Aquí
  **no** viven los datos de negocio de ninguna concesionaria.
- **`www.concesionariaX.com` = data plane.** El login y toda la operación de esa
  concesionaria ocurren **en su propio dominio**, contra **su propia base**.

Esta separación es deliberada y resuelve el problema de sesiones de golpe:

> Como cada tenant vive en un dominio distinto, **las cookies se aíslan solas por
> host.** La cookie `__access_token` de `concesionariaa.com` **nunca** se envía a
> `concesionariab.com` — es el navegador quien lo garantiza. El diseño de cookies
> actual (`httpOnly`, `path:/`, **sin** `Domain` explícito) ya es *host-only* y
> funciona sin cambios. Un tenant no puede, ni por error, presentar la sesión de
> otro.

### 4.2 Flujo de acceso (evita SSO cross-domain)

Recomendación: **el login ocurre en el dominio del tenant, no en
`cardealership.com`.** Así se evita el handoff de sesión entre dominios (un SSO
cross-domain es complejo y propenso a fugas). El embudo es:

1. El dueño se registra y paga en `cardealership.com` (cuenta de **control
   plane**, identidad separada de los usuarios de la herramienta).
2. Al activarse la suscripción se **provisiona el tenant** (§7.1) y se le entrega
   su URL (`concesionariaa.cardealership.com` de arranque, o su dominio propio).
3. El dueño y sus empleados **inician sesión en el dominio del tenant** — el flujo
   de auth actual, intacto, pero contra la base de ese tenant.

`cardealership.com` **no** necesita conocer las contraseñas de los usuarios de la
herramienta; son mundos separados (control plane vs data plane).

### 4.3 JWT scoping

El `AuthConfig` actual ya soporta `issuer` y `audience` fijados al firmar y
exigidos al verificar. En multi-tenant:

- **`audience` = identificador del tenant** (p. ej. su `documentId`). Un access
  token emitido para el tenant A es **rechazado** por el verificador del tenant B
  aunque compartieran secreto — defensa en profundidad además del aislamiento por
  dominio y por base.
- **`JWT_SECRET` por tenant (recomendado):** guardar el secreto en el registro del
  control plane (cifrado) e inyectarlo por-petición junto con el resto del
  `AuthConfig` del tenant. Un secreto filtrado compromete **un** tenant, no todos.
  *Aceptable al principio:* un secreto global + `audience` por tenant; se endurece
  después sin cambios de dominio.

## 5. Implementación conceptual dentro de la app

La buena noticia: la arquitectura hexagonal + DI por-petición ya existente hace que
la tenancy entre como **una dependencia inyectada más**, no como un parámetro que
haya que hilar por toda la lógica.

### 5.1 Un puerto nuevo: `TenantResolver` (+ `TenantContext`)

Un único concepto transversal nuevo, en `shared/tenancy/`:

```ts
// shared/tenancy/tenant.types.ts  (dominio — sin dependencias)
export interface Tenant {
  id: string;              // documentId estable del tenant (= audience del JWT)
  slug: string;            // "concesionariaa"
  status: "active" | "suspended" | "provisioning";
  // Cómo alcanzar SUS datos (el adaptador decide qué significa):
  databaseUrl: string;     // connection string de la base del tenant
  authConfig: AuthConfig;  // TTLs/claims/secret propios del tenant
}

// shared/tenancy/tenant-resolver.ts  (puerto)
export interface TenantResolver {
  // Resuelve el tenant a partir de la petición entrante (por host).
  // Devuelve null si el dominio no corresponde a ningún tenant activo.
  resolve(request: Request): Promise<Tenant | null>;
}
```

Dos adaptadores, uno por modo de despliegue:

- **`tenant-resolver.single.ts`** (proyecto a la medida): ignora el host y
  devuelve **siempre** el tenant configurado por env (`DATABASE_URL`, el
  `AuthConfig` actual). Es, literalmente, el comportamiento de hoy envuelto en el
  puerto. **Coste conceptual cero para el modo single-tenant.**
- **`tenant-resolver.control-plane.ts`** (SaaS): lee `request.headers.host`,
  busca el dominio en el **control plane** (con caché — ver §5.4) y devuelve el
  `Tenant` con su `databaseUrl` y `authConfig`. Dominio desconocido/suspendido →
  `null` → la app responde 404/página de "tenant no encontrado".

Qué adaptador se cablea lo decide una env: `TENANCY_MODE=single | multi`.

### 5.2 El punto de inyección: `prisma` pasa a ser por-tenant

Hoy, en [container.server.ts](../../app/shared/di/container.server.ts), `prisma`
es un **singleton de proceso**:

```ts
prisma: asValue(prisma),   // hoy: una sola base para todo el proceso
```

El cambio de fondo es **una línea de concepto**: `configureContainer` resuelve el
tenant *antes* de registrar dependencias y registra el **cliente Prisma de ese
tenant** (obtenido de un pool cacheado — ver §5.3):

```ts
// Pseudocódigo — configureContainer(request, apiContext)
const tenant = await tenantResolver.resolve(request);
if (!tenant) throw new Response("Tenant no encontrado", { status: 404 });
if (tenant.status !== "active") throw redirect(BILLING_URL); // suspendido/moroso

const prisma = tenantDbPool.getClient(tenant);   // Prisma ligado a la base del tenant
const authConfig = tenant.authConfig;            // secret/claims del tenant

freshContainer.register({
  prisma:     asValue(prisma),
  authConfig: asValue(authConfig),
  tenant:     asValue(tenant),
  // ...el resto del cableado NO cambia
});
```

**Todo lo que está aguas abajo no se toca.** Repositorios, servicios, casos de uso
y guards reciben `prisma` (y `authConfig`) por DI: no saben ni les importa de qué
tenant vienen. Eso es exactamente lo que compra el patrón puerto+adaptador — la
tenancy es un detalle de **composición**, no de la lógica de negocio.

Los singletons de proceso que **no** dependen del tenant (logger, storage) siguen
compartidos. Los que llevan estado potencialmente sensible entre tenants
(`rateLimiter`, `singleFlight`) deben **namespacear sus claves por tenant** para
que el límite de login de A no afecte a B: p. ej. `auth:login:email:${tenantId}:${email}`.
El adaptador Redis (§8.5) los hace correctos entre nodos y entre tenants.

### 5.3 Gestión de conexiones (el verdadero coste de "base por tenant")

Base por tenant = **N bases = N pools de conexiones**. Con muchos tenants esto
explota el número de conexiones a Postgres. Mitigaciones (por orden de preferencia):

1. **Pool de clientes perezoso con evicción LRU.** El `tenantDbPool` crea el
   `pg.Pool` + `PrismaClient` de un tenant **la primera vez** que llega una
   petición suya y lo **cachea**; los tenants inactivos se **cierran** por LRU/TTL.
   Cada pool con `max` bajo (p. ej. 2–5 conexiones). `@prisma/adapter-pg` (ya en el
   proyecto) hace esto directo: `new PrismaPg(new Pool({ connectionString, max }))`.
2. **Un pooler externo (PgBouncer) en modo transaction.** Multiplexa miles de
   conexiones lógicas sobre pocas físicas. Casi obligatorio a partir de decenas de
   tenants activos concurrentes.
3. **Postgres gestionado con pooler incorporado** (Supabase, Neon, RDS Proxy).
   Neon además da bases "scale-to-zero", ideal para el long tail de concesionarias
   con poco tráfico.

> Este es **el** trade-off del modelo elegido. Si el número de tenants creciera a
> un punto donde ni el pooler basta, ahí es donde el adaptador de "schema por
> tenant" (una base, un pool) entra sin tocar dominio (§3.3).

### 5.4 Resolución con caché

Resolver el tenant contra el control plane en cada petición es un query extra en el
camino caliente. Se cachea el mapa `host → Tenant` en memoria del proceso con TTL
corto (p. ej. 30–60 s) e invalidación por evento en cambios (alta, cambio de
dominio, suspensión por impago). Es el mismo patrón de "puerto + adaptador memoria
→ Redis" que ya usa el rate limiter.

### 5.5 RBAC y el nuevo rol de plataforma

El RBAC actual (`ROLES` en `shared/rules/atoms.rules.ts`, punto único en
`requireRole`) sigue **igual dentro de cada tenant**: los roles de la herramienta
(p. ej. `ADMIN`, `USER`) son **por tenant** y viven en la base del tenant.

Lo nuevo es la **identidad de control plane** (el dueño que paga): vive en el
control plane, con sus propios roles (p. ej. `OWNER`, `BILLING`). Es un sistema de
auth **separado** del de los tenants — no mezclar el `requireRole` del data plane
con la autorización del panel de billing.

## 6. Modelo de datos

### 6.1 Base del tenant (data plane) — **sin cambios**

El schema actual (`User`, `Session`, y los datos de negocio) se mantiene **idéntico**.
Cada tenant tiene su propia copia. **No** se añade `tenantId` a estas tablas: el
tenant *es* la base. (En modo pool/RLS sí se añadiría — pero ese no es el modelo
elegido.)

### 6.2 Control plane — **base nueva**

Una base compartida, separada, para el registro y el billing. Esquema conceptual:

```prisma
model Tenant {
  id            String   @id @default(uuid())   // = audience del JWT del tenant
  slug          String   @unique                // "concesionariaa"
  status        String   @default("provisioning") // provisioning|active|suspended
  databaseUrl   String                           // cifrado en reposo (secreto)
  jwtSecret     String                           // cifrado; secreto de auth del tenant
  createdAt     DateTime @default(now())
  domains       TenantDomain[]
  subscription  Subscription?
}

model TenantDomain {
  id        String  @id @default(uuid())
  tenantId  String
  hostname  String  @unique                      // "www.concesionariaa.com"
  isPrimary Boolean @default(false)
  verifiedAt DateTime?                            // verificación de propiedad del dominio
  certStatus String @default("pending")           // pending|issued|failed
  tenant    Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model Account {            // el DUEÑO que se registra y paga en cardealership.com
  id        String @id @default(uuid())
  email     String @unique
  password  String                                // auth del control plane (reusa el módulo auth)
  tenantId  String?                               // el tenant que le pertenece
}

model Subscription {
  id                 String @id @default(uuid())
  tenantId           String @unique
  provider           String                        // "stripe"
  externalCustomerId String
  status             String                        // active|past_due|canceled
  currentPeriodEnd   DateTime
  tenant             Tenant @relation(fields: [tenantId], references: [id])
}
```

Nota: la tabla `TenantDomain` es N:1 con `Tenant` a propósito — un tenant puede
tener el subdominio de arranque **y** su dominio propio apuntando al mismo lugar.
`hostname` único es el índice del `TenantResolver`.

## 7. Flujos

### 7.1 Alta y aprovisionamiento (el corazón del auto-servicio)

```
Registro en cardealership.com
  │
  ├─ 1. Alta de Account (dueño) + elección de slug
  ├─ 2. Checkout de la suscripción (Stripe)
  │        └─ webhook `checkout.session.completed` / `customer.subscription.active`
  │
  └─ 3. PROVISIONING (job idempotente disparado por el webhook):
         a. Crear la base del tenant (o schema)         ← infra, §8.3
         b. `prisma migrate deploy` contra esa base     ← infra, §8.4
         c. Seed: crear el usuario ADMIN inicial (el dueño) en la base del tenant
         d. Registrar Tenant + TenantDomain(subdominio) en el control plane
         e. Emitir/rutear el certificado TLS del subdominio  ← infra, §8.2
         f. status = "active"; invalidar caché del resolver
  │
  └─ 4. Entregar al dueño su URL y credenciales de primer acceso
```

Claves: **idempotente** (un webhook puede repetirse), **transaccional donde se
pueda**, y con estado `provisioning` visible para no dejar tenants a medias. Un
fallo en (a–c) no debe dejar una fila `active` sin base.

### 7.2 Ciclo de vida de una petición (data plane)

Añade **un paso** al middleware actual de [root.tsx](../../app/root.tsx), **antes**
del contenedor:

```
Petición a www.concesionariaX.com
  │
  ├─ 0. CSRF (Origin) — igual que hoy
  ├─ NUEVO: resolver tenant por host → Tenant (o 404 si desconocido)
  │         · status != active → redirect a billing / página de suspensión
  ├─ 1. configureContainer(request): registra el prisma + authConfig DEL TENANT
  │         · a partir de aquí, TODO el flujo de auth es idéntico al actual
  ├─ 2. loader/action (requireAuth/requireRole leen authPayload, sin cambios)
  └─ 3. cookies de refresh, igual que hoy (aisladas por host de forma natural)
```

### 7.3 Onboarding de dominio propio (`www.concesionariaa.com`)

Arranque en subdominio (`concesionariaa.cardealership.com`, cubierto por el
comodín TLS — §8.2). Cuando la concesionaria quiere su dominio:

1. En su panel introduce `www.concesionariaa.com`.
2. Se le pide crear un **CNAME** hacia la plataforma (o un registro de verificación
   TXT para probar propiedad).
3. Al detectar el CNAME, la plataforma **emite el certificado on-demand** (§8.2) y
   marca `TenantDomain.certStatus = issued`, `verifiedAt`.
4. El `TenantResolver` ya resuelve ese hostname → mismo tenant. Sin redeploy.

### 7.4 Suspensión y baja

- **Impago:** webhook `past_due`/`canceled` → `status = suspended` → el resolver
  deja de servir la app (redirect a billing) **sin borrar datos**. Reversible al
  pagar.
- **Baja definitiva:** exportar datos (obligación contractual/legal frecuente),
  luego desaprovisionar (borrar base/schema, liberar dominio y certificado).
  Retención configurable antes del borrado duro.

## 8. Infraestructura fuera de la app

Esto es lo que **no** es código de la app pero el SaaS necesita para existir.

### 8.1 Enrutado / entrada (routing)

- Un **reverse proxy / edge** delante de la app que acepte **todos** los hostnames
  de los tenants y los pase a la (misma) app: los subdominios `*.cardealership.com`
  y los dominios propios de cada tenant. El `Host` original **debe** llegar intacto
  a la app (es la clave del `TenantResolver`).
- Opciones: **Caddy** (on-demand TLS integrado, muy simple para este patrón),
  **nginx + acme**, **Cloudflare for SaaS** (custom hostnames gestionados),
  **Vercel/Netlify domains API**, o un ingress de Kubernetes con cert-manager.
- Recordatorio de seguridad heredado de auth: el proxy debe **sobrescribir**
  `X-Forwarded-For`/`X-Forwarded-Host` para que la IP y el host sean de confianza
  (el rate limit por IP y la resolución por host dependen de headers no
  falsificables desde el cliente).

### 8.2 TLS y dominios

- **Comodín `*.cardealership.com`** para todos los subdominios de arranque: un solo
  certificado wildcard (DNS-01 con Let's Encrypt/ZeroSSL). Cubre el alta inmediata
  sin emitir un cert por tenant.
- **Dominios propios (`www.concesionariaX.com`):** **TLS on-demand / ACME por
  hostname** — el proxy emite el certificado la primera vez que llega tráfico a un
  hostname ya verificado. Caddy on-demand TLS o Cloudflare for SaaS lo hacen casi
  sin código. Requiere el paso de verificación de propiedad (§7.3) para no emitir
  certificados de dominios ajenos.
- **DNS:** subdominios vía registro wildcard `*.cardealership.com`. Dominios
  propios los apunta **el cliente** con un CNAME hacia la plataforma (documentar el
  target exacto en su panel).

### 8.3 Aprovisionamiento de bases

- **Base por tenant** implica un mecanismo automatizado de **crear base** en el
  aprovisionamiento. Segun proveedor:
  - Postgres gestionado con API (Neon, Supabase, RDS): crear base/branch por API en
    el job de provisioning. **Neon** encaja especialmente por bases *scale-to-zero*
    (el long tail de concesionarias con poco tráfico no cuesta cómputo ocioso).
  - Postgres propio: un rol de administración que ejecute `CREATE DATABASE` +
    conceda permisos al rol de app. Aislar credenciales por tenant si el compliance
    lo pide.
- **Credenciales:** cada `databaseUrl` es un **secreto**. Guardar cifrado en el
  control plane o, mejor, en un gestor de secretos (Vault, AWS/GCP Secrets Manager)
  y en el control plane solo la referencia.

### 8.4 Migraciones a través de N bases

El punto operativo más subestimado del modelo. Una migración de schema debe correr
contra **todas** las bases de tenant **y** la del control plane.

- Un **runner de migraciones** que itere el registro de tenants y ejecute
  `prisma migrate deploy` contra cada `databaseUrl`. Debe ser **idempotente**,
  **reintentable**, y reportar por-tenant (éxitos/fallos) para no dejar el flota en
  estados de schema mixtos.
- **Orden de despliegue** compatible hacia atrás (expand/contract): desplegar
  código que tolere el schema viejo y el nuevo, migrar todas las bases, luego
  retirar lo viejo — porque no todas las bases migran en el mismo instante.
- Tenants en aprovisionamiento nacen ya con el último schema (paso 3b de §7.1).

### 8.5 Estado compartido entre nodos (Redis)

Ya anticipado en [auth/00 §8](../auth/00-sistema-autenticacion.md): con varios
nodos de app, `rateLimiter` y `singleFlight` en memoria dejan de ser correctos.
En multi-tenant se vuelve **más** urgente y con un requisito extra: **claves
namespaceadas por tenant** (§5.2). Adaptador Redis para ambos puertos + la caché
del `TenantResolver`.

### 8.6 Billing

- **Stripe** (u otro) como fuente de verdad de la suscripción. **Webhooks** →
  control plane → transición de `status` del tenant (active/past_due/suspended) →
  invalidación de la caché del resolver.
- Verificar la firma del webhook; procesarlo de forma **idempotente** (Stripe
  reintenta). El estado del tenant es lo que gobierna el acceso, no la respuesta
  síncrona del checkout.

### 8.7 Observabilidad y backups por tenant

- **Logs/métricas etiquetados con `tenantId`** para poder diagnosticar y facturar
  por uso. El `Logger` actual ya soporta `child(bindings)`: añadir `tenantId` al
  binding en el middleware.
- **Backups por base** (ventaja del modelo: restaurar/exportar un solo tenant sin
  tocar a los demás — imposible de forma limpia en el modelo pool).
- **Aislamiento de fallos:** un tenant que corrompe sus datos no arrastra a los
  demás. Un tenant que satura su base no debe saturar el pool global — de ahí el
  `max` bajo por pool (§5.3).

## 9. Modo single-tenant (proyecto a la medida)

La misma plantilla sirve a un cliente único **sin control plane ni ninguna de la
infra de §8**:

- `TENANCY_MODE=single` → se cablea `tenant-resolver.single.ts`, que devuelve
  siempre el tenant de env (`DATABASE_URL`, `JWT_SECRET`, `AuthConfig` actuales).
- El middleware "resuelve" ese único tenant (un lookup en memoria, sin control
  plane) y el resto del flujo es **idéntico** al actual.
- No hay Stripe, ni provisioning, ni dominios múltiples, ni migraciones N-way (una
  base = un `migrate deploy`).

El resultado: **una sola base de código** cuya diferencia entre "SaaS" y "a la
medida" es **una variable de entorno y qué adaptador de `TenantResolver` se
registra**. El dominio y la lógica de negocio son bit a bit los mismos.

## 10. Qué construir (checklist) y orden sugerido

Aditivo sobre lo existente; nada de lo anterior se reescribe.

1. **Puerto `TenantResolver` + `TenantContext` + adaptador `single`.** Refactor de
   `configureContainer` para resolver tenant y registrar `prisma`/`authConfig` por
   tenant. *Con esto el modo single-tenant ya corre por el nuevo camino, sin
   cambio de comportamiento — se valida la abstracción sin infra.*
2. **`tenantDbPool`** (pool de clientes Prisma por tenant con LRU) sobre
   `@prisma/adapter-pg`.
3. **Control plane:** base + schema (`Tenant`, `TenantDomain`, `Account`,
   `Subscription`) + adaptador `tenant-resolver.control-plane` con caché.
4. **Namespacing por tenant** de `rateLimiter`/`singleFlight` + adaptador Redis.
5. **Provisioning:** job idempotente (crear base → migrate → seed → registrar →
   status active) disparado por webhook de billing.
6. **Infra de entrada/TLS:** proxy con on-demand TLS + wildcard; onboarding de
   dominio propio (CNAME + verificación).
7. **Billing:** Stripe + webhooks → estado del tenant.
8. **Runner de migraciones N-way** + observabilidad por tenant + backups.

**Sugerencia de secuenciación de valor:** 1→2→3 dan un SaaS funcional en
subdominios (`concesionariaX.cardealership.com`) con base por tenant. 6 añade
dominios propios. 5 y 7 automatizan el auto-servicio. 4 y 8 endurecen para escala.

## 11. Riesgos y límites conocidos

| Riesgo | Mitigación |
|---|---|
| Explosión de conexiones (N bases) | Pool perezoso + LRU + `max` bajo por tenant; PgBouncer/pooler gestionado; Neon scale-to-zero (§5.3) |
| Migraciones desincronizadas entre tenants | Runner idempotente + reportado por tenant; despliegues expand/contract (§8.4) |
| Emisión de certificados de dominios ajenos | Verificación de propiedad (CNAME/TXT) antes de emitir (§7.3, §8.2) |
| Fuga de estado en memoria entre tenants | Claves namespaceadas por `tenantId` en rate limiter / single-flight (§5.2) |
| Secretos de conexión por tenant | Cifrado en reposo / gestor de secretos; nunca en logs (redacción ya existente) |
| Tenant a medio aprovisionar | Estado `provisioning` + job idempotente y reintentable (§7.1) |
| "Tenant gigante" que necesita aislamiento de cómputo | Excepción puntual al modelo silo para ese tenant; el puerto lo permite sin afectar al resto (§3.1) |
| Confusión entre auth de control plane y de data plane | Sistemas de identidad separados; no compartir `requireRole` entre planos (§5.5) |

## 12. Resumen ejecutivo

- **Un SaaS, una app.** No una instancia por concesionaria: aísla **datos**,
  comparte **cómputo**.
- **Base de datos por tenant** para el aislamiento fuerte que pediste, resuelta por
  **dominio** en un **puerto** (`TenantResolver`) con adaptadores `single`/`multi`.
- **Dos planos:** control plane (`cardealership.com`: registro, billing, dominios)
  y data plane (dominio del tenant: la app actual contra su base).
- **La app apenas cambia:** un paso de resolución en el middleware y `prisma`
  pasando a ser por-tenant vía DI. Servicios, repositorios y auth quedan intactos.
- **La misma plantilla es single-tenant** con `TENANCY_MODE=single` — sin control
  plane ni infra de SaaS.
- **El grueso del trabajo nuevo es infra fuera de la app:** entrada/TLS con
  dominios propios, aprovisionamiento de bases, migraciones N-way, billing y estado
  compartido (Redis).
