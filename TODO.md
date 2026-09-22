[x] Sesiones se crean fuera de formulario de curso
[x] Mejorar la interfaz del area de cursos/mis cursos. 
[x] Añadir una imagen al curso como portada.
[x] Preparar el plan anual para poder crear cursos desde ahí. 
[ ] Añadir una landing page del instituto con muestras de cursos públicos.
[ ] Añadir contenido multimedia a sesiones que lo requieran
[ ] Mejorar los mensajes de error por campo en todos los formularios.
[ ] Mejorar la seccion de reglas al editar/crear un curso. 
[ ] Permitir registro antes y durante el curso
[ ] Hacer LMS
[ ] QR para inscripción.
[ ] Imparticion y cursos 
[ ] Darle acceso a un capacitador cuando yo soy capacitador dew un curso
[ ] Quitarle la seccion de "Capacitadores" al capacitador.
[ ] Cambiar los number inputs por el nuevo en remutys

---

## Alcance actual del seguimiento de cursos

El seguimiento vive en `app/modules/teaching` (PRD-06, §6.8) más los dos módulos
que cierra: `credits` y `ratings`.

### Qué hace hoy

**Rutas** (`app/modules/teaching/routes/routes.config.ts`)

- `/dashboard/imparticion` — lista paginada de cursos publicados y finalizados
  que la persona imparte u organiza, con búsqueda y filtro por estado.
- `/dashboard/imparticion/:documentId` — ficha de trabajo: sesiones,
  participantes, resultados y cierre.

**Pase de lista** (`resolveAttendanceMarks`, `teaching.rules.ts`)

- Por sesión, sobre los inscritos `ENROLLED`, marcando asistió / no asistió.
- La sesión se abre desde el inicio del día local de su fecha (`isSessionOpen`).
- Solo se escriben las marcas que cambian, para que `recorded_by` diga quién
  hizo el último cambio.
- Si alguien del envío ya no está inscrito, se rechaza el envío completo.

**Resultados** (`resolveResultEntries`)

- Solo si el curso tiene `requiresEvaluation`: aprobado / no aprobado y nota
  opcional 0–100. La nota nunca acompaña a `PENDING`.

**Cierre** (`finish`)

- Se habilita desde el día de la última sesión. Bloqueadores explícitos: no
  publicado, sin sesiones, demasiado pronto, resultados pendientes
  (`finishBlockerOf`).
- Calcula completado como `% asistencia ≥ mínimo Y (aprobado O sin evaluación)`,
  en aritmética entera, otorga créditos y abre la valoración. Todo bajo
  `FOR UPDATE` sobre la fila del curso.

**Corrección posterior** — escribir asistencia o resultados en un curso
`FINISHED` es la corrección; solo superadmin, titular o auxiliar de la
organizadora (`canCorrect`). Recalcula y otorga, restaura o revoca el crédito en
la misma transacción.

**Lo derivado** — créditos (`/dashboard/mis-creditos`, `/dashboard/creditos`),
valoración 1–5 anónima desde "Mis cursos", y la línea del plan anual que pasa a
_realizada_ sola (ADR-0007). El participante ve en "Mis cursos" su asistencia,
nota y si completó.

Referencia: `docs/teaching/00-imparticion-creditos-y-valoracion.md` y
`docs/adr/0006-imparticion-creditos-y-valoracion.md`.

### Qué no cubre

Cada hueco con su motivo: unos son decisión del alcance MVP y otros están
pendientes de verdad. Marcar cuál es cuál evita reabrir discusiones cerradas.

[ ] **Constancias y diplomas en PDF** con folio, QR y verificación pública.
Fuera del MVP, **primer candidato para la fase 2**. Es el hueco más pedido.

[ ] **Aviso por correo al finalizar el curso y al otorgar el crédito.**
`NotificationEvent` cubre invitación, inscripción, actualización y cancelación;
nada del cierre. Quien completa un curso no se entera de que ya tiene su crédito.

[ ] **Motivo en la bitácora de ajustes.** Hoy se guarda quién corrigió y cuándo,
pero no por qué. El alcance lo da por "parcial" a propósito; completarlo es
añadir una columna y un campo en la corrección.

[x] **Evaluaciones múltiples por curso.** Un curso puede tener varias
evaluaciones ("Práctica de campo", "Proyecto final"), con sesión opcional. Por
persona se captura aprobado / no aprobado y una observación en texto, visible
solo para quien imparte u organiza. Son documentales: el veredicto que otorga el
crédito sigue siendo el de la pestaña Resultados, capturado a mano. Ver
`docs/adr/0010-evaluaciones-por-curso.md` y `docs/evaluations/00-evaluaciones.md`.

[ ] **Cuestionario de evaluación en línea.** Sigue fuera del MVP (M6): no hay
exámenes que el participante conteste, solo captura manual del capacitador.

**Descartados por decisión de alcance, no pendientes:**

- **Tableros, gráficas, comparativos y reportes exportables.** El MVP los cambia
  por tablas simples. No hay vista de seguimiento en vivo.
- **Avance de contenido o progreso de temario.** No es un LMS y no aloja
  contenido: las sesiones en línea son enlaces externos. El único avance que se
  mide es asistencia por sesión.
- **Porcentaje de cumplimiento contra el PAC asignado** (M8). Se sustituye por
  el conteo de créditos.
- **Expediente digital consolidado.** Se cubre parcialmente con "Mis cursos" y
  "Mis créditos".

## Asistencia por QR

[x] QR estático por curso con token opaco rotable, registro automático de
asistencia a la sesión activa, con ventana de tolerancia configurable por curso.
Ver `docs/adr/0009-asistencia-por-qr.md` y `docs/check-in/00-asistencia-por-qr.md`.

[ ] Fase 2: QR dinámico con rotación temporal. El estático se puede fotografiar
y reenviar; la ventana estrecha y la rotación manual lo acotan, no lo cierran.
