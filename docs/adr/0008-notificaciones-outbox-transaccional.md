# ADR 0008 · Notificaciones: outbox en la misma transacción, sin contraseñas por correo

**Estado:** aceptado · 2026-09-16
**Contexto del cambio:** PRD-08 (notificaciones mínimas)

## 1. Contexto

§6.12 del alcance pide plantillas fijas, envío asíncrono y que "si falla el
correo, no se bloquee ninguna operación". Los avisos nacen en cuatro módulos
(`users`, `trainers`, `enrollments` y `courses`), casi siempre en medio de una
transacción: inscribirse bloquea la fila del curso y asignar escribe un lote.

Dos formas de fallar que hay que evitar:

- **avisar de algo que no pasó**: se manda "inscripción confirmada" y la
  transacción se revierte por falta de cupo;
- **perder un aviso de algo que sí pasó**: el curso se cancela, el proceso se
  reinicia antes de enviar y nadie se entera.

§6.1 dice además que la contraseña temporal se entrega por un canal privado y
que no hay recuperación de autoservicio. §8 deja fuera la "bitácora de envíos".

## 2. Decisión

### 2.1 · El aviso se encola en la base, dentro de la transacción del caso de uso

`notificationService.notify(events)` escribe en `org.email_outbox` y nada más.
Quien avisa lo llama **dentro** de su `runInTransaction`, después de la escritura
principal. Los casos de uso que no tenían transacción (alta y restablecimiento
de contraseña, traslado de dependencia, cancelar un curso) pasaron a tenerla. El
repositorio entra en la transacción ambiental sin saberlo
([0002](./0002-perfil-de-capacitador-y-transaccion-entre-modulos.md) §2.3).

- Si la operación se revierte, el aviso se revierte con ella.
- Si el proceso se reinicia, el aviso ya está en la base y sale después.
- Si el SMTP falla, la operación ya respondió: el envío es asunto del worker.

**"No bloquear" se cumple así:** el único fallo que el usuario ve es el de la
propia base, que ya habría hecho fallar la operación. `notify` devuelve
`AppResponse`, así que un error al encolar queda en el log y no lanza.

**Alternativa descartada:** llamar al mailer tras el commit, sin esperar. Es más
simple, pero un reinicio o una caída del SMTP pierden avisos sin dejar rastro, y
no hay dónde reintentar.

### 2.2 · El correo se redacta al encolar

La fila guarda `subject`, `text` y `html` ya renderizados. Las plantillas son
funciones puras (`notification.templates.ts`) que reciben el evento con los datos
que el caso de uso ya tenía en mano.

**Por qué:** el aviso tiene que describir el curso **como era en el momento del
evento**. Si "cambió la sede" se renderizara al enviar, un segundo cambio
ocurrido antes del envío haría que los dos correos dijeran lo mismo. Además, el
worker no necesita leer tablas de otros módulos: solo envía.

**Lo que se paga:** corregir el texto de una plantilla no cambia los mensajes ya
encolados.

### 2.3 · Un worker en el proceso, seguro con varias instancias

`startEmailOutboxWorker` corre cada `EMAIL_WORKER_INTERVAL_S` (15 s por defecto),
nunca se solapa consigo mismo y no arranca dos veces con la recarga en caliente.
`claimDue` reserva con `SELECT … FOR UPDATE SKIP LOCKED`, marca `locked_until`
(5 min) y cuenta el intento en una transacción corta. Varias réplicas del
servidor no envían dos veces el mismo mensaje, y un worker que muere a medio
envío libera sus mensajes cuando vence la reserva.

Reintentos: 1 min, 5 min, 30 min, 2 h y 12 h. Si falla también después del de
12 h, el mensaje queda `FAILED` con `last_error` recortado a 500 caracteres. Los
`SENT` se purgan a los 30 días.

**Riesgo asumido:** un servidor que acepta el mensaje y se cae antes de que se
marque `SENT` provoca un duplicado al vencer la reserva. Es preferible a perderlo.

### 2.4 · No es la bitácora de §8

La cola no tiene pantalla ni se consulta como historial. Los enviados se borran,
y lo que queda sirve para diagnosticar fallos (`status`, `attempts`,
`last_error`). Si algún día se necesita "a quién se avisó de qué", esa sí sería
una bitácora y requeriría su propia decisión.

### 2.5 · Sin contraseñas por correo; sin recuperación de autoservicio

- **Alta de cuenta** (interna o capacitador externo): correo de bienvenida
  **sin credenciales**, que remite a quien administra la dependencia.
- **Contraseña restablecida por un administrador:** aviso de seguridad, sin la
  contraseña.
- **No hay "¿Olvidaste tu contraseña?"**: §6.1 se mantiene.

**Por qué:** un correo con credenciales queda en buzones, reenvíos y copias de
seguridad fuera del control de la plataforma. El aviso de restablecimiento sirve
de alarma si alguien lo hizo sin que la persona lo supiera. Una recuperación por
token exigiría una tabla de tokens, rutas públicas con límite de intentos y
retirar la contraseña temporal. Queda como candidata cuando exista Llave BC o se
decida.

### 2.6 · Transporte SMTP detrás de un puerto

`IMailer` (`app/shared/mail`) tiene dos adaptadores: SMTP con nodemailer y uno
que solo escribe destinatario y asunto en el log. Sin `SMTP_HOST` se usa el de
log. Con `SMTP_HOST`, el arranque exige `MAIL_FROM` y `APP_BASE_URL`. En
desarrollo, Mailpit en `compose.yml`.

## 3. Consecuencias

| Invariante | Dónde vive |
| --- | --- |
| Un aviso sale solo si su operación se confirmó | `notify` dentro de la `runInTransaction` del caso de uso |
| Un aviso no se envía dos veces por réplica | `FOR UPDATE SKIP LOCKED` + `locked_until` |
| Ningún correo lleva credenciales | Plantillas + pruebas de `users`, `trainers` y plantillas |
| Solo los cambios de horario, sede o enlace avisan | `hasScheduleChanges` en `course.rules.ts` |
| Un traslado propio no avisa | `changeDependency`, rama `!isSelf` |

**Lo que no se garantiza:** la entrega en el buzón. Un `SENT` significa que el
servidor SMTP aceptó el mensaje.
