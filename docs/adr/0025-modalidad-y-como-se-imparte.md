# ADR 0025 · Modalidad primero, y el híbrido autogestivo

**Estado:** aceptado · 2026-09-28
**Contexto del cambio:** MVP-02 · paso Programa del alta de cursos
**Enmienda:** [ADR-0011](./0011-formato-de-curso-y-regla-de-completado.md) §2.1 (qué pide
cada sesión de un híbrido) y §2.6 (un autogestivo es siempre `ONLINE`)

## 1. Contexto

El paso Programa preguntaba el formato (calendarizado o autogestivo) y, solo si había
sesiones, la modalidad. Quien da de alta un curso piensa al revés: primero dónde se imparte,
y después, si es en línea, si es en vivo o a su ritmo. Además aparece un caso que los dos ejes
no admitían: un curso híbrido cuyo temario se recorre a su ritmo y que se complementa con
encuentros —un taller práctico, por ejemplo—.

## 2. Decisiones

### 2.1 Los ejes no cambian; cambia el orden de las preguntas

`modality` y `format` siguen siendo dos columnas. El formulario pregunta la modalidad y, en
`ONLINE` o `HYBRID`, «¿cómo se imparte la parte en línea?»: *Contenido a su ritmo*
(`SELF_PACED`) o *Sesiones en vivo* (`SCHEDULED`). `IN_PERSON` fija `SCHEDULED`. No hay
migración.

### 2.2 El híbrido autogestivo admite sesiones opcionales

`allowsSessions` es verdadero para todo `SCHEDULED` y para `SELF_PACED + HYBRID`.
`requiresSessions` conserva su significado —el curso se reúne y su ciclo lo marcan las
sesiones—, así que el híbrido autogestivo vive el ciclo del autogestivo: no se finaliza,
completa por contenido, la inscripción se cierra a mano y sus sesiones **no cuentan** para
completarlo. Aparecen en el calendario y se pasa lista en ellas.

- Publicar no exige sesiones; las que haya deben decir dónde se imparten (`places`).
- `assertDeadlineBeforeStart` solo compara contra la primera sesión cuando el formato la exige.
- `resolveModality` guarda `ONLINE` a todo autogestivo que no sea híbrido.

### 2.3 El híbrido siempre tiene capacitador

`requiresTrainer` pasa de recibir el formato a recibir `{ format, modality }` y es igual a
`allowsSessions`. Un híbrido autogestivo pide capacitador aunque no tenga sesiones todavía.

### 2.4 Una sesión híbrida es presencial **o** en línea

Antes cada sesión híbrida exigía sede **y** enlace. Ahora le basta uno de los dos
(`isSessionPlaced`): un curso híbrido mezcla sesiones en sede y por videollamada. Presencial
sigue exigiendo sede y en línea, enlace. Una sesión híbrida sin ninguno de los dos se rechaza
con `COURSE_SESSION_MISSING_PLACE`. Los cursos híbridos existentes ya tienen los dos datos y
siguen siendo publicables.

### 2.5 Qué se congela al publicar

`assertFormatEditable` también bloquea cambiar la modalidad cuando eso haría que el curso
dejara de admitir sesiones (híbrido autogestivo → en línea): borraría las sesiones y su
asistencia. Un calendarizado publicado sigue pudiendo cambiar de modalidad.

## 3. Rechazos

| Situación | Código |
| --- | --- |
| Sesión híbrida sin sede ni enlace | `COURSE_SESSION_MISSING_PLACE` |
| Híbrido autogestivo publicado que pasa a en línea | `COURSE_FORMAT_LOCKED` |
