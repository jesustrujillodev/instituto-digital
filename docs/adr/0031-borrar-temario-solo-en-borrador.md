# ADR 0031 · El temario se borra, y solo en borrador

**Estado:** aceptado · 2026-10-05
**Reemplaza:** [ADR 0012 §2.5](./0012-estructura-de-contenido-y-modulo-propio.md) ·
[ADR 0016 §2.5](./0016-evaluacion-por-modulo.md)

## 1. Contexto

El ADR 0012 decidió que borrar no existía: un módulo o una lección se archivaba
(`archived_at`) para que el avance de quien ya la recorrió no quedara huérfano. El
ADR 0016 hizo lo mismo con la evaluación de módulo, por sus intentos. La interfaz
ya decía «Eliminar» y no había forma de recuperar lo archivado, así que la
fila seguía en la base sin que nada la leyera: el avance, la calificación y el aula
filtran `archived_at IS NULL`.

Todas las FK que cuelgan de `lessons` y `course_modules` son `ON DELETE CASCADE`
(`lesson_contents`, `lesson_progress`, `quizzes` y, de ahí, preguntas, opciones,
intentos y respuestas). Ninguna restricción frena un `DELETE`: el riesgo no es que
la base lo rechace, sino que se lleve en silencio el avance y los intentos de los
participantes.

## 2. Decisiones

### 2.1 Se borra de verdad, pero solo en borrador

`deleteModule` y `deleteLesson` hacen `DELETE` de la fila, con su material en
cascada, y re-empaquetan el orden de los hermanos en la misma transacción.
`deleteModuleQuiz` borra la evaluación del módulo con su banco.

Solo mientras el curso está en `DRAFT` (`canDeleteContent`). Un curso no vuelve a
borrador una vez publicado, así que un borrador nunca tuvo inscritos, avance ni
intentos: la cascada no se lleva nada de nadie.

Publicado, el temario **solo se edita o crece**: borrar responde
`CONTENT_DELETE_LOCKED` y la interfaz deja «Eliminar» apagado con el motivo. Un
curso finalizado o cancelado sigue respondiendo antes `CONTENT_COURSE_NOT_EDITABLE`.

### 2.2 Lo que se queda igual

- Un módulo con lecciones activas o con su evaluación activa no se borra
  (`CONTENT_MODULE_NOT_EMPTY`, `CONTENT_MODULE_HAS_QUIZ`): vaciarlo es un gesto
  explícito.
- El material de una lección borrada se descarta del bucket en *best-effort*,
  fuera de la transacción.
- El examen final, las prácticas y las evaluaciones de seguimiento no cambian.

### 2.3 `archived_at` se queda

Las columnas siguen en `course_modules`, `lessons` y `quizzes`, y los filtros
`ACTIVE` también: hay filas archivadas en cursos ya publicados, con avance o
intentos colgando, que no se borran.
`scripts/purge-archived-content.ts` borra las archivadas de los borradores con la
misma regla; sin `--apply` solo cuenta.

## 3. Consecuencias

- Borrar una lección o una evaluación de módulo ya no recalcula el avance: en
  borrador no hay a quién.
- Una lección mal creada en un curso publicado se corrige editándola (título, tipo,
  material, obligatoria u opcional), no borrándola.

## 4. Códigos

| Situación | Código |
| --- | --- |
| Borrar un módulo, una lección o una evaluación de módulo de un curso publicado | `CONTENT_DELETE_LOCKED` |
| Borrar un módulo con lecciones activas | `CONTENT_MODULE_NOT_EMPTY` |
| Borrar un módulo con su evaluación activa | `CONTENT_MODULE_HAS_QUIZ` |
