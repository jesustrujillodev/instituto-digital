# Operación (`/dashboard/operacion`)

Pantalla de solo lectura del superadministrador para lo que la entrega de fondo no
pudo completar después de agotar sus reintentos. Su resumen aparece en el panel
de inicio (tarjeta «Operación»).

## Qué muestra

| Pestaña | Fuente | Columnas |
|---|---|---|
| Correos fallidos (`?tab=emails`) | `email_outbox` con `status = FAILED` | destinatario, plantilla, último error, intentos, fecha de encolado |
| Trabajos fallidos (`?tab=jobs`) | `job_failure` | trabajo, cola, error, intentos, fecha del fallo |

- Nunca se leen el asunto ni el cuerpo del correo, ni el `payload` del trabajo,
  que puede llevar datos personales. Las consultas lo comprueban en sus pruebas.
- El error se enseña en una línea recortada (`previewError`); el texto completo
  queda en el título del elemento.
- Solo se lee la pestaña activa: dos consultas en paralelo (página y total).

## Resumen del panel

`operationsService.summarizeHealth` cuenta:

- correos fallidos;
- correos pendientes cuyo turno pasó hace más de `STUCK_EMAIL_MINUTES` (30): un
  worker que no vacía la cola;
- trabajos fallidos en los últimos `JOB_FAILURE_WINDOW_DAYS` (7).

## Piezas

- Módulo `app/modules/operations/` (sin `infrastructure/`): las consultas viven en
  los puertos dueños de cada tabla, `INotificationRepository` (`findFailed`,
  `countFailed`, `countStuck`) e `IJobFailureRepository` (`findPage`, `count`,
  `countSince`).
- Acceso: `OPERATIONS_ROLES = ["SUPERADMIN"]`, exigido en el loader antes de leer.

## Fuera de alcance

Reintentar un correo o reencolar un trabajo. Hacerlo bien exige reiniciar estado e
intentos, validar el payload de cada cola y despachar por `jobDispatcher`, con sus
pruebas de mutación.
