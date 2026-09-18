# Asistencia por QR — Referencia

## 1. Qué es

Un QR estático por curso. Quien lo escanea registra su propia asistencia a la
sesión que esté activa en ese momento, sin importar la modalidad del curso.

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| `app/modules/check-in` | dominio, servicio, ruta pública | Resuelve el token, la inscripción y la sesión activa |
| `app/modules/check-in/components/course-qr-panel.tsx` | ficha de impartición | Dibuja el QR, lo descarga y lo regenera |
| `app/shared/auth/return-to.ts` | login | Allowlist del `redirectTo` |

Ruta pública: `/asistencia/:token`, montada en **ZONA 1** de `app/routes.ts`.

Las decisiones están en [ADR 0009](../adr/0009-asistencia-por-qr.md).

El módulo **no tiene `infrastructure/`**: no es dueño de ninguna tabla. Escribe
por los puertos de los módulos dueños.

## 2. El modelo

| Tabla / columna | Qué guarda |
| --- | --- |
| `org.courses.qr_token` | Token opaco único, nulo hasta que alguien lo genera |
| `org.courses.qr_token_rotated_at` | Cuándo se rotó por última vez |
| `org.courses.qr_opens_before_minutes` | Tolerancia antes de cada sesión (15 por defecto) |
| `org.courses.qr_closes_after_minutes` | Tolerancia después de cada sesión (15 por defecto) |
| `org.course_attendance.source` | `MANUAL` (pase de lista) o `QR` (autorregistro) |

## 3. El flujo

```
Escaneo del QR
  │
  ▼ GET /asistencia/<token>          (loader, NO escribe)
  │ rateLimiter.consume             20/min por IP
  │ validateCheckInToken            ^[A-Za-z0-9_-]{32}$
  │ ¿authPayload?  ──no──▶ redirect /iniciar-sesion?redirectTo=/asistencia/<token>
  │ checkInService.preview
  ▼ pantalla "Registrando tu asistencia…"
  │
  ▼ POST /asistencia/<token>         (action, auto-enviado al montar)
  │ checkInService.register
  │   courseRepository.findByQrToken   el token ES la autorización
  │   assertCheckInOpen                solo PUBLISHED
  │   enrollmentRepository.findEnrollment
  │   assertEnrolled                   solo ENROLLED
  │   resolveSessionOutcome            la ventana activa ahora
  │   teachingRepository.checkIn       upsert idempotente
  ▼ "✓ Asistencia registrada — Curso · Sesión N · hora"
```

## 4. Qué sesión marca el escaneo

`resolveSessionOutcome` recorre las sesiones y compara el instante contra
`[startsAt − opensBefore, endsAt + closesAfter]`, con los bordes **inclusivos**.

| Situación | Resultado | Qué ve quien escanea |
| --- | --- | --- |
| Una ventana contiene el instante | `ACTIVE` | Se registra |
| Varias la contienen | `ACTIVE`, la que abrió antes | Se registra |
| Todas por delante | `TOO_EARLY` + `opensAt` | "El registro abre el …" |
| Todas por detrás | `CLOSED` + `closedAt` | "El registro cerró el …" |
| El curso no tiene sesiones | `WITHOUT_SESSIONS` | "Todavía no tiene sesiones" |

## 5. Rechazos

Todos llevan un `code` estable; el texto vive en
`utils/check-in-error-messages.ts`.

| Código | Cuándo | Status |
| --- | --- | --- |
| `CHECK_IN_INVALID_TOKEN` | Forma inválida **o** ningún curso con ese token | 404 |
| `CHECK_IN_COURSE_NOT_OPEN` | Curso `DRAFT`, `FINISHED` o `CANCELLED` | 409 |
| `CHECK_IN_NOT_ENROLLED` | Sin inscripción, `DECLINED` o `WITHDRAWN` | 403 |
| `CHECK_IN_INVITATION_PENDING` | `INVITED`, con `details.courseDocumentId` | 403 |
| `CHECK_IN_WITHOUT_SESSIONS` | Publicado sin sesiones | 409 |
| `CHECK_IN_SESSION_NOT_OPEN` | Con `details.opensAt` | 409 |
| `CHECK_IN_SESSION_CLOSED` | Con `details.closedAt` | 409 |
| `CHECK_IN_RATE_LIMITED` | Con `details.retryAfterMs` | 429 |
| `CHECK_IN_FORBIDDEN_SCOPE` | Rotar el QR sin alcance de impartición | 403 |

Token mal formado y token inexistente comparten código a propósito: distinguir
los dos casos convertiría la ruta en un oráculo de qué tokens existen.

**"Ya registrada" no está aquí**: es un éxito con `status: "ALREADY_RECORDED"`.

## 6. El QR en la ficha

Pestaña "Código QR" de `/dashboard/imparticion/:documentId`, visible solo cuando
`canWrite` — el mapper no expone `detail.qr` a quien no puede escribir.

- Se dibuja en el cliente con `qrcode`, nivel de corrección **Q** (25 %) y
  `margin: 4`: el impreso se dobla, se mancha y se fotocopia.
- **SVG** para el documento maquetado y **PNG 1024 px** para pegar en Word.
- Regenerar pide confirmación y avisa de que **el impreso deja de funcionar**.

## 7. Amenazas → defensas

| Amenaza | Defensa |
| --- | --- |
| El QR se fotografía y circula por WhatsApp | Ventana estrecha por sesión + rotación. **Riesgo residual aceptado** |
| Fuerza bruta del token | 192 bits + `rateLimiter` por IP en loader y action |
| Una vista previa de enlace registra asistencia | La escritura solo ocurre en el POST |
| Open redirect vía `?redirectTo=` | Allowlist con patrón exacto |
| Alguien no inscrito marca asistencia | `assertEnrolled` exige `ENROLLED` |
| Se marca una sesión pasada o futura | Ventana acotada por los dos extremos |
| Un escaneo mueve créditos | `assertCheckInOpen` exige `PUBLISHED` |
| Doble escaneo duplica filas | PK `(session_id, user_id)` + upsert idempotente |
| El QR se filtra a quien no puede escribir | El mapper solo lo expone si `canWrite` |
| Enumerar cursos probando tokens | `INVALID_TOKEN` idéntico en los dos casos |

**Limitación conocida:** `rateLimiter` es en memoria **por proceso**, así que con
N instancias el límite efectivo es N×límite. Es defensa en profundidad; la real
es la entropía del token.

## 8. Añadir una operación

1. Si lee o escribe el curso del token, pasa por `courseRepository`.
2. Si escribe asistencia, pasa por `teachingRepository`: es su dueño.
3. Las guardas van en `domain/check-in.rules.ts`, puras y sin I/O, y se aplican
   **igual** en `preview` y en `register` — si el preview fuera más permisivo, la
   pantalla prometería un registro que luego falla.
