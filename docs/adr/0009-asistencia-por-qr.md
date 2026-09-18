# ADR 0009 · Asistencia por QR: token opaco rotable y sesión activa

**Estado:** aceptado · 2026-09-17
**Contexto del cambio:** asistencia por QR (§6.8)

## 1. Contexto

Hasta ahora la asistencia solo se registraba con el pase de lista manual del
capacitador (`teachingService.saveAttendance`). El alcance MVP v2 descartaba el
QR de forma explícita ("Asistencia por QR con ventana de vigencia | No | Pase de
lista manual"), pero en un aula de cuarenta personas el pase de lista es lento y
en línea obliga a cotejar nombres contra la lista de asistentes.

Se reincorpora en su forma más simple: **un QR estático por curso** que el
asistente escanea para registrarse él mismo.

El problema no es dibujar un QR. Es que el escaneo:

1. llega por **GET**, desde un teléfono que puede **no traer sesión**;
2. tiene que decidir **a qué sesión** aplica, si el QR es del curso;
3. no puede convertirse en una forma de marcar asistencia sin estar presente;
4. escribe en `org.course_attendance`, cuyo dueño es `teachingRepository`
   ([0006](./0006-imparticion-creditos-y-valoracion.md)).

## 2. Decisiones

### 2.1 El QR lleva un token opaco rotable, no el `documentId`

`org.courses.qr_token` es una columna única y **nullable**, con 192 bits de
entropía (`randomBytes(24).toString("base64url")`).

- **No es el `documentId`** porque ese identificador ya circula en las URLs del
  dashboard y no se puede invalidar sin romper el curso entero.
- **Nullable** para que la migración sea aditiva sin backfill de una columna
  única, y para que la ficha distinga "sin QR" de "con QR".
- **Se guarda en claro**, a diferencia del refresh token, que se guarda
  hasheado. El capacitador tiene que poder reimprimir el mismo QR meses después
  y un hash es irreversible. Es un secreto de bajo valor —solo permite marcarse
  a uno mismo, en un curso donde ya se está inscrito, dentro de la ventana de
  una sesión— y es rotable.

**Riesgo residual aceptado:** un QR estático se fotografía y circula. La defensa
es la ventana estrecha y la rotación, no el secreto. La solución real es el QR
dinámico, y esta columna deja el camino abierto sin otra migración.

### 2.2 El escaneo marca la sesión ACTIVA, no la del día

`resolveSessionOutcome` busca la primera sesión, por `startsAt`, cuya ventana
`[startsAt − tolerancia, endsAt + tolerancia]` contenga el instante del escaneo.

La alternativa —"la sesión que cae hoy"— permitiría marcar a las 23:00 una
sesión de las 09:00, que es exactamente la ausencia de prueba de presencia que
el QR debería evitar.

Con ventanas solapadas gana la que **abrió antes**. La regla tiene que ser
determinista porque quien escanea no elige.

Sin sesión activa se distingue `TOO_EARLY` (con el `opensAt` de la próxima) de
`CLOSED` (con el `closedAt` de la última): un "no se puede" genérico deja a
quien está en la puerta sin saber qué hacer.

La tolerancia es **por curso** (`qr_opens_before_minutes`,
`qr_closes_after_minutes`, 15 por defecto). Nadie llega clavado a la hora y la
fila del aula tarda; a la vez, una dependencia puede exigir puntualidad.

### 2.3 El loader LEE, el action ESCRIBE, y el envío es automático

Un escaneo es un GET. Si el loader escribiera:

- quedaría **fuera del guard CSRF** de `app/root.tsx`, que solo intercepta
  métodos de escritura;
- el flujo anónimo dispara el GET **dos veces** (una antes del login y otra al
  volver), y solo la segunda escribiría;
- un prefetch, el bfcache o la vista previa de enlace de WhatsApp, Slack o
  Teams registrarían asistencias que nadie pidió.

El loader valida en solo lectura y pinta la pantalla; el componente envía el
POST solo al montar (`useFetcher` + guarda con `useRef`, porque StrictMode monta
dos veces). Un `<Form method="post">` con botón visible queda de reserva sin JS.

"Ya registrada" **no es un rechazo**: viaja como `status: "ALREADY_RECORDED"` en
la rama `ok`. Desde el punto de vista de quien escanea la operación tuvo éxito.

### 2.4 El `redirectTo` del login es una allowlist cerrada, no una validación

`docs/routing/00-sistema-enrutado.md` decidió que el login siempre aterrice en
`/dashboard`. Esa decisión **sigue en pie**: `requireAuth`, `require-role` y el
middleware de `root.tsx` no se tocan.

La ruta de asistencia se impone la sesión ella misma y redirige a
`/iniciar-sesion?redirectTo=/asistencia/<token>`. El login honra el parámetro
solo si casa con `^/asistencia/[A-Za-z0-9_-]{32}$` (`app/shared/auth/return-to.ts`).

Una allowlist cierra el open redirect **por construcción**, en vez de intentar
detectarlo con reglas del tipo "empieza por `/` pero no por `//`", que es donde
viven los bypass.

El token se valida **antes** de construir la URL del login: solo un token con la
forma esperada llega al parámetro.

### 2.5 `check-in` es un módulo sin `infrastructure/`

El escaneo lo hace un participante sobre sí mismo, no quien imparte: no pasa por
`requireTeaching` y su ruta vive fuera de ZONA 2. Meterlo en `teaching` haría
que ese módulo dejara de significar "quien imparte u organiza".

El módulo nuevo **no es dueño de ninguna tabla**, así que no tiene
`infrastructure/`. Escribe a través de los puertos de los módulos dueños, como
manda §9 de la referencia de impartición:

- `ITeachingRepository.checkIn(...)` para `course_attendance`;
- `ICourseRepository.findByQrToken(...)` / `rotateQrToken(...)` para `courses`.

Sigue habiendo **un solo escritor por tabla**.

### 2.6 Gana el QR, y la marca queda auditada

`org.course_attendance.source` (`MANUAL | QR`) distingue el origen. Una marca
manual de ausencia **se sobreescribe** cuando la persona escanea: cubre el caso
real de llegar tarde al pase de lista. Un segundo escaneo **no** reescribe, para
que `recorded_at` conserve el instante del primero.

Inferir el origen de `recorded_by_id` —"si es la propia persona, fue QR"— sería
frágil: un capacitador inscrito en su propio curso la rompe.

### 2.7 Sin transacción ni bloqueo del curso

`teachingService.saveAttendance` toma `SELECT … FOR UPDATE` sobre el curso
porque recalcula créditos sobre el roster entero. El escaneo escribe **una** fila
con clave primaria compuesta `(session_id, user_id)`: el upsert ya es atómico y
el curso está `PUBLISHED`, así que no hay créditos que mover.

Bloquear el curso serializaría a las cuarenta personas que escanean al entrar al
aula. Sería activamente dañino.

Corolario: `assertCheckInOpen` exige `PUBLISHED`, así que un escaneo **nunca**
toca un curso finalizado y `syncCompletion` no entra en juego. Recalcular
créditos sigue siendo un acto deliberado de quien imparte o de la dependencia.

## 3. Consecuencias

- Una migración aditiva: un enum, cuatro columnas en `courses` y una en
  `course_attendance`.
- `HTTP_STATUS` gana el 429: el rate limit del escaneo lo consume un loader, y
  `auth` no lo necesitaba porque el suyo solo lo consume un action.
- El login deja de devolver `null` y devuelve `ok({ redirectTo })`, lo que además
  lo pone en conformidad con §25.2 de las reglas.
- Dependencia nueva: `qrcode`, usada solo en el cliente para dibujar y descargar.

## 4. Lo que se rechazó

| Alternativa | Por qué no |
| --- | --- |
| El QR lleva el `documentId` del curso | Ya circula en otras URLs y no se puede invalidar |
| Hashear el token, como el refresh token | Impide reimprimir el mismo QR |
| La sesión del día en vez de la activa | Permite marcar a las 23:00 una sesión de las 09:00 |
| El loader escribe | GET mutador: fuera del CSRF, y lo dispara cualquier prefetch |
| `redirectTo` genérico validado | Revierte una decisión documentada y abre la superficie de open redirect |
| El escaneo acepta la invitación e inscribe | Inscribir mira cupo, fecha límite y audiencia: reglas de `enrollments` |
| La feature dentro de `teaching` | Todo `ITeachingService` empieza por `requireScope`; el escaneo no |
| `check-in` con su propio `prisma` | Rompe el dueño único de `course_attendance` ([0006](./0006-imparticion-creditos-y-valoracion.md)) |
