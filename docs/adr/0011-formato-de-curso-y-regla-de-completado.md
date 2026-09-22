# ADR 0011 · Formato de curso y regla de completado

**Estado:** aceptado · 2026-09-21
**Contexto del cambio:** MVP-02 · F-01, el cimiento del curso autogestivo

## 1. Contexto

La plataforma solo sabe de cursos que se reúnen. Esa suposición no está escrita
en un sitio: está repartida en tres puertas cerradas, en dos módulos.

1. `assertPublishable` (`course.rules.ts`) exige al menos una sesión antes de
   publicar, sin condición ninguna.
2. `finishBlockerOf` (`teaching.rules.ts`) devuelve `WITHOUT_SESSIONS` antes que
   cualquier otra comprobación, así que un curso sin sesiones tampoco se cierra.
3. `meetsAttendance` devuelve `false` cuando el total de sesiones es cero, de
   modo que `isCompleted` es falso para todo el mundo y `completedParticipantsOf`
   devuelve la lista vacía. Aunque se pudiera cerrar, no otorgaría un solo
   crédito.

El MVP-02 pide un curso que se recorra a ritmo propio. Abrir una de las tres
puertas sin las otras deja el curso publicable y muerto, o cerrable y sin
acreditar.

## 2. Decisiones

### 2.1 Dos ejes, no dos valores más de `CourseModality`

La tentación era añadir `SELF_PACED` al enum de modalidad. Se rechaza: ese enum
responde **dónde** se reúne el curso, y de él dependen `requiresVenue` y
`requiresLink`, que deciden si cada sesión pide sede, enlace o las dos. Un valor
que significa «no se reúne» dentro de ese enum degrada la pregunta: la regla de
publicación pasaría de «sede en las presenciales, enlace en las en línea» a
«sede **o** enlace», que es más floja que la de hoy.

Se añade una columna:

```prisma
enum CourseFormat {
  SCHEDULED
  SELF_PACED
}

model Course {
  modality CourseModality              // dónde se reúne
  format   CourseFormat @default(SCHEDULED)  // si se reúne
}
```

El `@default` es el backfill: todo curso anterior queda `SCHEDULED` y se comporta
exactamente como antes.

### 2.2 No existe un valor `BLENDED`

El alcance del MVP-02 proponía un tercer valor para el curso que mezcla sesiones
y contenido. Se rechaza por dos motivos. El primero es de vocabulario: en español
`BLENDED` y `HYBRID` se dicen igual —«mixto»— y el lector tendría que recordar
cuál de los dos ejes nombra cada uno. El segundo es que sería redundante: un
curso con sesiones **y** contenido ya se expresa con los dos ejes que hay,
`SCHEDULED` más la regla de completado que corresponda. `BLENDED` se comportaría
igual que `SCHEDULED` en la única regla que el formato gobierna —si hacen falta
sesiones para publicar—, así que no separa ningún caso.

### 2.3 `completion_rule` decide qué cuenta como completar

```prisma
enum CourseCompletionRule {
  ATTENDANCE
  CONTENT
}
```

`isCompleted` ramifica por ella. La rama `ATTENDANCE` queda **idéntica** al
comportamiento previo, bit a bit: es la que gobierna todo el histórico de
créditos y una prueba de no-regresión la fija. La rama `CONTENT` no mide
asistencia; hoy se apoya en el resultado capturado a mano, que es la vía que ya
existe y la única que sabe distinguir a quien terminó.

**No se declara `BOTH`.** Significaría «asistencia y contenido», y el contenido
no existe hasta que llegue el avance por lección. Lo único que podría
implementar hoy es «asistencia y evaluación», que es lo que ya hace `ATTENDANCE`
con `requires_evaluation` activo. Sería un valor indistinguible de otro cuyo
significado cambiaría en silencio más adelante, sobre cursos ya configurados.
Añadirlo cuando haya contenido que contar es una línea; deshacer un significado
que alguien ya eligió, no.

### 2.4 Las dos combinaciones que se rechazan en el alta

`assertCompletionRuleCoherent` corre en `buildWriteData`, al crear y al editar:

| Combinación | Código | Por qué |
| --- | --- | --- |
| `SELF_PACED` + `ATTENDANCE` | `COURSE_INCOMPATIBLE_COMPLETION_RULE` | Un curso sin sesiones no tiene asistencia que medir: nadie lo completaría nunca |
| `CONTENT` + `requires_evaluation = false` | `COURSE_COMPLETION_RULE_WITHOUT_EVALUATION` | Sin contenido ni evaluación, todo inscrito completaría y el cierre repartiría créditos a quien no hizo nada |

La segunda es una restricción **temporal** y así está comentada en el código: se
relaja cuando exista el avance por lección, que le dará a `CONTENT` algo más que
la evaluación de dónde leer.

### 2.5 El formato se congela al publicar

`canEdit` admite modificar un curso `PUBLISHED` —cambiar horario o sede avisa por
correo a los inscritos—. Pero pasar de `SCHEDULED` a `SELF_PACED` hace que
`syncSessions` borre las sesiones, y `course_attendance` tiene PK
`(session_id, user_id)`: con la sesión se va el pase de lista. `assertFormatEditable`
lo impide con `COURSE_FORMAT_LOCKED`, y el formato solo se elige en borrador.

### 2.6 Un autogestivo es `ONLINE` y no enseña su modalidad

`modality` es obligatoria en la base y no tiene default. Para un curso que no se
reúne, el servicio la fija en `ONLINE` y el formulario oculta el selector.
«Presencial y autogestivo» no describe nada, y la modalidad solo tiene efecto
sobre sesiones que ese curso no tiene.

### 2.7 El checklist omite, no marca

`publishChecklist` deja fuera de la lista los pendientes `sessions` y `places`
cuando el formato no pide sesiones, en vez de darlos por cumplidos. Es el mismo
criterio que ya seguía `audience` con el acceso no restringido: lo que no aplica
no se enseña. Una prueba cruzada obliga a `publishChecklist` y a
`assertPublishable` a coincidir, porque si divergen la ficha promete una
publicación que el servicio rechaza.

### 2.8 El cierre de un autogestivo y el ejercicio de su crédito

`finishBlockerOf` salta `WITHOUT_SESSIONS` y `TOO_EARLY` cuando el formato no
pide sesiones: no hay última fecha que esperar, y el curso se cierra cuando quien
lo imparte decide. `PENDING_RESULTS` sigue aplicando igual a los dos formatos.

El ejercicio del crédito no necesitó nada: `fiscalYearOf` ya era
`lastSessionOf(course)?.startsAt ?? fallback`, y el `fallback` que `syncCompletion`
le pasa es la fecha de cierre. Un autogestivo cerrado en marzo de 2027 acredita
el ejercicio 2027.

## 3. Consecuencias

- Dos enums y dos columnas nuevas, ambas con default: ninguna fila existente
  cambia de comportamiento.
- Tres errores tipados nuevos y su copia en español en
  `course-error-messages.ts`.
- El wizard gana un selector en *Programa* y otro en *Reglas*, sin pasos nuevos:
  `COURSE_WIZARD_STEPS` conserva sus cinco entradas y su numeración, así que
  ninguna URL `/nuevo/N` guardada cambia de destino.
- Elegir «Autogestivo» arrastra la regla a `CONTENT` y activa la evaluación en el
  mismo gesto. Se hace al cambiar el selector y no al llegar al paso de Reglas
  porque el wizard guarda cada paso por separado y el servidor rechazaría el
  guardado intermedio.
- La ficha de impartición de un autogestivo esconde las pestañas de Asistencia y
  de Código QR, y abre en Completado.
- **Tres reglas de `enrollments` daban por hecho que hay sesiones y hubo que
  abrirlas**, o el curso se publicaba y nadie podía entrar: `enrollmentClosesAt`
  devolvía `null` y `isEnrollmentOpen` lo leía como "cerrado"; `canWithdraw` exigía
  una primera sesión que proteger; y `classifyMyCourse` lo mandaba a "Próximos".
  El catálogo, además, filtraba por `sessions: { some: {} }` en SQL, así que el
  curso no aparecía siquiera.
- Queda pendiente para el avance por lección: el término de contenido de
  `isCompleted`, el valor `BOTH`, y el pendiente de publicación «al menos una
  lección».

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Un autogestivo que dice completarse por asistencia | `COURSE_INCOMPATIBLE_COMPLETION_RULE` |
| Completar por contenido sin evaluación | `COURSE_COMPLETION_RULE_WITHOUT_EVALUATION` |
| Cambiar el formato de un curso ya publicado | `COURSE_FORMAT_LOCKED` |
