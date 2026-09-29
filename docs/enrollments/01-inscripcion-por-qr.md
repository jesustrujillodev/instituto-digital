# Inscripción por QR — Referencia

## 1. Qué es

Un QR por curso para carteles y avisos impresos. Quien lo escanea llega a la
ficha del curso en el catálogo y confirma su inscripción con el botón de
siempre. El escaneo **no inscribe**: solo resuelve a qué curso lleva.

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| `app/modules/enrollment-qr` | dominio, servicio, ruta pública | Resuelve el token, genera y rota el QR |
| `app/modules/enrollment-qr/components/enrollment-qr-panel.tsx` | ficha de administración del curso | Dibuja el QR, lo descarga (SVG y PNG) y lo regenera |
| `app/shared/components/common/qr-code-download.tsx` | compartido con asistencia | Render y descarga del QR |
| `app/shared/auth/return-to.ts` | login | Allowlist del `redirectTo` |

Ruta pública: `/inscripcion/:token`, montada en **ZONA 1** de `app/routes.ts`.

El módulo no tiene `infrastructure/`: lee y escribe por los puertos de
`courses` (dueño de la tabla) y `enrollments`.

## 2. El modelo

| Columna | Qué guarda |
| --- | --- |
| `org.courses.enrollment_qr_token` | Token opaco único, nulo hasta que alguien lo genera |
| `org.courses.enrollment_qr_token_rotated_at` | Cuándo se generó o rotó por última vez |

Es un token distinto al de asistencia (`qr_token`): el cartel del pasillo y el
código del aula se regeneran por separado.

## 3. El flujo

```
Escaneo del QR
  │
  ▼ GET /inscripcion/<token>         (loader, NO escribe)
  │ rateLimiter.consume             20/min por IP
  │ validateEnrollmentQrToken       ^[A-Za-z0-9_-]{32}$
  │ ¿authPayload?  ──no──▶ redirect /iniciar-sesion?redirectTo=/inscripcion/<token>
  │ enrollmentQrService.resolve
  │   token inexistente          → ENROLLMENT_QR_INVALID_TOKEN   (404)
  │   no PUBLISHED o INVITATION  → ENROLLMENT_QR_UNAVAILABLE     (409)
  │   fuera de la audiencia      → ENROLLMENT_QR_NOT_IN_AUDIENCE (403)
  ▼ redirect /dashboard/cursos-disponibles/<documentId>
  │
  ▼ La ficha del catálogo y su action "Inscribirme" (enrollmentService.enroll)
```

## 4. Qué cursos lo admiten

`acceptsEnrollmentQr`: curso **publicado** con acceso **público o restringido**.

- **Por invitación, no.** El escaneo no podría inscribir a quien no fue
  invitado, y a quien sí lo fue le basta con «Mis cursos».
- **Inscripción cerrada, sí.** Un autogestivo se cierra y se reabre a mano, y un
  calendarizado cierra en su fecha límite. El panel avisa del cierre y la ficha
  muestra «inscripción cerrada» a quien escanee.
- Si después de imprimir el curso se cancela, finaliza o pasa a invitación, el
  escaneo responde `ENROLLMENT_QR_UNAVAILABLE` sin mostrar el curso.

## 5. Por qué redirige en vez de inscribir

La inscripción ya tiene un único punto de entrada con todas sus guardas:

- persona interna con dependencia y sin rol global (`canParticipate`);
- visibilidad por audiencia (`courseVisibilityWhere`);
- inscripción abierta (`isEnrollmentOpen`);
- dentro de la transacción y con la fila del curso bloqueada: ya inscrito,
  baja dada por quien organiza (`assertNotRemoved`), invitación exigida
  (`assertSelfEnrollable`) y cupo (`assertSeatsFor`);
- el aviso `ENROLLMENT_CONFIRMED`.

Si el escaneo inscribiera por su cuenta, tendría que duplicar esas reglas, y el
día que una cambiara el QR sería más permisivo que el catálogo. Además, la ficha
deja ver qué se acepta (fechas, modalidad, cupo) antes de ocupar un lugar. Las
inscripciones que entran por el QR quedan con origen `SELF`.

La resolución sí comprueba la audiencia antes de redirigir. Así, quien no está
en la audiencia de un curso restringido ve un mensaje claro, en lugar del 404
genérico de la ficha, y sigue sin ver nada del curso (§7 del alcance).

## 6. Quién lo genera

El mismo alcance de escritura que organiza las inscripciones del curso:
`courseScopeWriteWhere(resolveCourseScope(actor))`. Es decir, SUPERADMIN, el
titular o auxiliar de la dependencia organizadora, y el capacitador interno en
los cursos que creó. El token es una credencial: `find` solo lo entrega con ese
alcance.

Regenerar invalida de inmediato los carteles impresos. No cambia las
inscripciones ya hechas ni el QR de asistencia.

## 7. Descarga

SVG y PNG de 1024 px, generados en el navegador con `qrcode` (corrección de
errores "Q", margen de 4 módulos). El QR codifica
`window.location.origin + /inscripcion/<token>`.
