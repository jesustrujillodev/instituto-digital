# Despliegue

Cómo se pone en marcha la plataforma en Railway (o en un servidor propio) y qué
pasa cuando no hay Redis ni worker. Cada sección explica la idea en corto y enlaza
al documento con el detalle técnico.

## 1. Las piezas

| Pieza | Qué es | ¿Obligatoria? |
|---|---|---|
| **Web** | La aplicación que abren las personas. Un solo proceso que atiende todas las visitas. | Sí |
| **Base de datos** | PostgreSQL en Neon. | Sí |
| **Almacenamiento de archivos** | Un bucket S3 o compatible (R2, MinIO) o GCS: fotos, material, certificados. | Sí, si se suben archivos |
| **Correo** | Un servidor SMTP para los avisos. | No: sin él, los avisos solo se escriben en el log |
| **Redis** | Una memoria compartida rápida. | No |
| **Worker** | Un segundo proceso que hace el trabajo de fondo (correos, recálculos, borrados). | Solo si hay Redis |

Hoy QA en Railway tiene **solo la web**, sin Redis ni worker. Es una configuración
válida (ver §4).

Más detalle: [docs/redis/00-redis.md §1](docs/redis/00-redis.md),
[docs/queues/00-colas.md §1](docs/queues/00-colas.md).

## 2. La web

### Cómo se construye y arranca

Railway construye la imagen con el `Dockerfile` del repositorio. La imagen trae la
web y el worker ya compilados, pero **solo arranca la web**: el worker existe en la
imagen y nadie lo ejecuta salvo que se cree un servicio para él (§3).

La web arranca con `node --enable-source-maps build/http/index.js` (`bun run start`
fuera del contenedor), desde la raíz del proyecto. Es un servidor propio, igual al
`react-router-serve` de antes salvo el log de acceso: escribe cada visita sin la
parte de la dirección que lleva credenciales (el código de los QR y lo que va
después de `?`).

Las imágenes base del `Dockerfile` van fijadas por digest. Para actualizarlas hay
que resolver el digest nuevo de la misma etiqueta y reemplazarlo; Chromium no se
fija a una versión exacta, porque Alpine retira la anterior en cada parche.

La imagen ya trae Chromium, que se usa para exportar certificados en PDF y PNG; no
hay que configurar nada para eso.

El build deja también `build/worker/pdf-sanitize.js`, que limpia los fondos PDF de los
certificados en un hilo aparte. La web lo busca desde la carpeta en la que arranca, la
raíz del proyecto; con el `Dockerfile` no hay que hacer nada. Si falta,
subir un fondo PDF falla con un error inesperado en el log, no con "PDF inválido".

### Variables que la web necesita

La web revisa su configuración al arrancar. Si falta algo obligatorio o tiene un
valor inválido, **no arranca**, y el log de Railway dice qué variable falla y por qué.

**Obligatorias:**

| Variable | Qué poner | Más detalle |
|---|---|---|
| `DATABASE_URL` | La dirección de la base de Neon de ese entorno. | [database/00](docs/database/00-pool-de-conexiones.md) |
| `JWT_SECRET` | Una clave larga y aleatoria, propia de este entorno. | [auth/00 §4](docs/auth/00-sistema-autenticacion.md) |
| `COOKIE_SECRET` | Otra clave, **distinta** de la anterior. | [auth/00 §4](docs/auth/00-sistema-autenticacion.md) |
| `CLIENT_IP_SOURCE` | `proxy` en Railway. | [http/00](docs/http/00-ip-del-cliente.md) |
| `TRUSTED_PROXY_HOPS` | `1` en Railway. | [http/00](docs/http/00-ip-del-cliente.md) |

- **Las dos claves** firman las sesiones. Si alguien las conoce, puede hacerse pasar
  por cualquier usuario. Por eso no se acepta el texto de ejemplo
  (`change-me…`) ni la misma clave dos veces. Se generan así (una vez por clave):
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Cambiarlas cierra todas las sesiones abiertas: todos vuelven a iniciar sesión.
- **`CLIENT_IP_SOURCE`** le dice a la app en quién confiar para saber la IP de cada
  visitante. Con eso funcionan los límites de intentos de login y de escaneo de QR.
  Si después se pone Cloudflare delante o se cambia de servidor, este valor cambia.

**Según lo que se use:**

| Si se usa… | Variables | Más detalle |
|---|---|---|
| Archivos | `STORAGE_PROVIDER`, `STORAGE_BUCKET_NAME`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` y, salvo con AWS S3, `STORAGE_ENDPOINT` | [storage/00 §4](docs/storage/00-sistema-almacenamiento.md) |
| Descarga en ZIP del gestor de nube | Reglas CORS en el bucket para el dominio de la app | [storage/00 §7.3](docs/storage/00-sistema-almacenamiento.md) |
| Correo | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | [notifications/00 §4](docs/notifications/00-notificaciones.md) |
| Dominio propio | `APP_BASE_URL` (por ejemplo `https://capacitacion.gob.mx`). Es obligatoria en producción: sin ella no arranca. En Railway sin dominio propio no hace falta escribirla, se deduce del dominio del servicio. Es la dirección que llevan los enlaces de los correos y los QR de los certificados, y con https hace que las cookies de sesión viajen solo cifradas (`Secure`, prefijo `__Host-`) | [certificates/03 §5](docs/certificates/03-verificacion.md) |
| Redis | `REDIS_URL` (ver §3) | [redis/00 §8](docs/redis/00-redis.md) |

El resto de variables de `.env.example` tienen un valor por defecto razonable y no
hace falta tocarlas.

### Recomendaciones de Railway

- Poner el servicio en la región del este de EE. UU., la más cercana a Neon: cada
  consulta a la base paga la distancia. [database/00 §3](docs/database/00-pool-de-conexiones.md)
- Lo más grande que se sube a través de la web son 15 MB (el fondo de un
  certificado). Lo que pase de 16 MB se rechaza. El material de las lecciones y los
  videos van directo al bucket y no tienen ese límite.
  [storage/00 §5.5](docs/storage/00-sistema-almacenamiento.md)

## 3. Redis y worker (opcional)

### Qué cambia al agregar Redis

Redis es una memoria que comparten todos los procesos. Sirve para dos cosas:

1. **Coordinar varias copias de la web.** Con una sola copia no aporta mucho. Con
   dos o más, hace que los límites de intentos y el cierre de sesiones sean los
   mismos en todas. [redis/00 §3 y §4](docs/redis/00-redis.md)
2. **Hacer cola de trabajos de fondo.** Los correos, recálculos y borrados se
   apuntan en Redis y otro proceso, el **worker**, los va haciendo. La web responde
   más rápido y un correo que falla se reintenta solo.
   [queues/00](docs/queues/00-colas.md)

**Importante:** en cuanto la web tiene `REDIS_URL`, deja de mandar correos ella
misma y espera que lo haga el worker. **Redis sin worker = no sale ningún correo.**

### Cómo montarlo en Railway

1. **Redis:** **+ New → Database → Redis**. Configurarlo para que no borre datos al
   llenarse y los guarde en disco (`noeviction`, `appendonly yes`,
   `appendfsync everysec`, volumen persistente).
   [redis/00 §8](docs/redis/00-redis.md)
2. **Web:** agregar `REDIS_URL=${{Redis.REDIS_URL}}`. Railway sustituye eso por la
   dirección interna de Redis.
3. **Worker:** **+ New → GitHub Repo** con el mismo repositorio. En
   **Settings → Deploy → Custom Start Command** poner `node build/worker/index.js`;
   sin esto arrancaría otra copia de la web. No generarle dominio público ni
   revisión de salud por web: no atiende visitas.
4. **Variables del worker:** las mismas que la web (se pueden referenciar, por
   ejemplo `JWT_SECRET=${{web.JWT_SECRET}}`), con dos diferencias:
   - `CLIENT_IP_SOURCE=none`: no recibe visitas;
   - `APP_BASE_URL` **escrita a mano**, por ejemplo
     `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`. La web la deduce de su dominio, pero
     el worker no tiene dominio. Sin ella no arranca.
5. **Comprobar:** el log del worker no muestra errores al arrancar, y un correo de
   prueba (por ejemplo, el de una inscripción) llega.

Al desplegar una versión nueva, Railway avisa al worker que se detenga y este
termina lo que tenía en curso antes de salir.
[queues/00 §6](docs/queues/00-colas.md)

## 4. Cómo funciona sin Redis ni worker (la configuración actual)

La web hace todo ella sola:

| Tarea | Qué pasa |
|---|---|
| **Correos** | La web revisa cada 15 segundos la bandeja de salida (una tabla de la base) y manda lo pendiente. Si un envío falla, lo reintenta más tarde. [notifications/00 §3](docs/notifications/00-notificaciones.md) |
| **Recálculo del avance de un curso** | Se hace en el momento en que alguien edita. [queues/00 §5](docs/queues/00-colas.md) |
| **Borrado de archivos** | Se hace en el momento, sin esperar la respuesta. [queues/00 §5](docs/queues/00-colas.md) |
| **Mantenimiento programado** | No corre. La limpieza de sesiones se puede lanzar a mano desde el panel. [queues/00 §5](docs/queues/00-colas.md) |
| **Límite de intentos de login** | Se lleva en la memoria de la web. [redis/00 §3.3](docs/redis/00-redis.md) |
| **Cierre de sesiones** | Inmediato: la misma web que lo ordena es la que atiende. [redis/00 §4](docs/redis/00-redis.md) |

Con **una sola copia de la web** esto funciona bien. Si algún día se ponen dos o
más copias sin Redis:

- los correos siguen saliendo una sola vez (cada copia toma filas distintas de la
  bandeja);
- los límites de intentos se multiplican por el número de copias;
- un cierre de sesión tarda hasta 5 segundos en llegar a las demás copias
  ([auth/02](docs/auth/02-revocacion-inmediata-epoch.md)).

Ese es el momento de agregar Redis y el worker.

## 5. La base de datos

- **Cambios de estructura:** el proyecto no usa migraciones. La estructura se
  aplica con `bunx prisma db push` desde una computadora, apuntando al
  `DATABASE_URL` de ese entorno, **antes** de desplegar la versión que la necesita.
  La imagen no aplica cambios a la base por sí sola.
- **Entorno nuevo:** además de la estructura, la base necesita una fila de
  configuración de seguridad y una primera cuenta de superadministrador. Las crea
  `bun run bootstrap`, desde una computadora y apuntando al `DATABASE_URL` de ese
  entorno:

  ```
  BOOTSTRAP_SUPERADMIN_EMAIL=… BOOTSTRAP_SUPERADMIN_PASSWORD=… bun run bootstrap
  ```

  No borra nada y se puede repetir: si ya hay un superadministrador activo, no
  hace nada. Rechaza las contraseñas que están en el repositorio y las que no
  cumplen la política. Ese superadministrador tiene que cambiar la contraseña en
  su primer acceso. Opcionales: `BOOTSTRAP_SUPERADMIN_EMPLOYEE_NUMBER` (por
  defecto `ADMIN-0001`), `BOOTSTRAP_SUPERADMIN_FIRST_NAME` y
  `BOOTSTRAP_SUPERADMIN_LAST_NAME`.
- ⚠ **`bun run seed` es solo para desarrollo:** borra todos los datos y crea
  cuentas con la contraseña `Password123!`, que está publicada en el repositorio.
  Con `NODE_ENV=production` se niega a correr.

## 6. Lista antes de desplegar

**En Railway, servicio web:**
- [ ] `DATABASE_URL` apunta a la base correcta.
- [ ] `JWT_SECRET` y `COOKIE_SECRET` propios: no empiezan con `change-me` y son distintos entre sí.
- [ ] `CLIENT_IP_SOURCE=proxy` y `TRUSTED_PROXY_HOPS=1`.
- [ ] Variables de archivos y de correo, si se usan.
- [ ] Si hay bucket público, `STORAGE_PUBLIC_BUCKET_NAME` distinto de `STORAGE_BUCKET_NAME` (si son iguales, no arranca).
- [ ] La primera vez que se despliegue con las cookies `__Host-`, todos vuelven a iniciar sesión una vez: las cookies anteriores tienen otro nombre.

**Si hay Redis y worker:**
- [ ] `REDIS_URL` en la web y en el worker.
- [ ] El worker con su comando de inicio, `CLIENT_IP_SOURCE=none` y `APP_BASE_URL`.

**En la base:**
- [ ] La estructura está al día (`bunx prisma db push`) si la versión cambia el esquema.
- [ ] Entorno nuevo: `bun run bootstrap`, no el seed.
- [ ] Si alguna vez se sembró con el seed: las cuentas de prueba ya no tienen `Password123!` (o están archivadas).
- [ ] Al desplegar esta versión: `bunx prisma db push` agrega la columna `must_change_password`.

## 7. Comprobar después de desplegar

1. **Inicio de sesión:** se puede iniciar sesión.
2. **IP:** en `/dashboard/sesiones`, la sesión muestra tu IP real. Para confirmarlo,
   inicia sesión enviando una IP inventada en la cabecera
   `X-Forwarded-For: 198.51.100.1`: la sesión debe seguir mostrando tu IP real.
   Si aparece la inventada, hay que revisar `TRUSTED_PROXY_HOPS`.
   [http/00 §3](docs/http/00-ip-del-cliente.md)
3. **Archivos:** se puede subir y abrir un archivo (por ejemplo, una foto de perfil).
4. **Correo:** un aviso de prueba llega (o aparece en el log si no hay SMTP).
5. **Certificados:** se puede descargar un certificado en PDF.
