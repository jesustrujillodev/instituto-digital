# ADR 0012 · Estructura de contenido y módulo propio

**Estado:** aceptado · 2026-09-21
**Contexto del cambio:** MVP-02 · F-03, el temario del curso autogestivo

## 1. Contexto

[ADR-0011](./0011-formato-de-curso-y-regla-de-completado.md) abrió el curso que
no se reúne: un `SELF_PACED` se publica sin sesiones y se completa por
`completion_rule = CONTENT`. Pero `CONTENT` no tiene de dónde leer. Se apoya en
el resultado capturado a mano, que es la vía que ya existía, y el propio ADR dejó
escrito el pendiente: «el término de contenido de `isCompleted`, el valor `BOTH`,
y el pendiente de publicación *al menos una lección*».

Hoy un autogestivo es un curso sin sesiones y sin nada dentro. F-03 pone el
esqueleto —módulos y lecciones ordenados— y el pendiente de publicación que lo
exige. El material de cada lección y el avance de quien la recorre llegan después.

## 2. Decisiones

### 2.1 El contenido es un módulo propio, no más archivos en `courses/`

`app/modules/courses/` ya tiene noventa y cinco archivos, y el contenido no es
una propiedad del curso: tiene su propio ciclo de vida (se edita después de
publicar), su propio público (el participante inscrito, que nunca entra a
`courses/`) y va a tener su propia fuente de referencias de storage en cuanto
exista el material. Vive en `app/modules/content/` con las cuatro capas y sus
puertos.

La dirección de dependencia permitida es **`content → courses`**, y solo por
piezas puras: `CourseScope`, `courseScopeWriteWhere`, `canEdit` y el guard de
ruta `requireCourseScope`. No hay rol de capacitador: quién puede tocar el
temario sale del alcance sobre el curso concreto, igual que editar su ficha.

### 2.2 El conteo de lecciones entra a `courses` por el repositorio, no por el servicio

El pendiente de publicación lo evalúa `courses`, pero el dato vive en `content`.
Tres caminos, uno elegido:

| Opción | Veredicto |
| --- | --- |
| Que el repositorio de cursos lea las tablas de contenido por un join | Rechazada: rompe la frontera que motiva el módulo aparte |
| Inyectar `contentService` en `courseService` | Rechazada: `content` ya depende de `courses`, y sería un ciclo entre servicios que ninguna prueba puede montar sin doblar los dos lados |
| **Inyectar `contentRepository` en `courseService`** | **Elegida.** `contentRepository` solo depende de `prisma`, así que el grafo queda acíclico. Es la lectura de un entero, que es exactamente lo que un puerto de repositorio es |

Y la regla no lo adivina: `assertPublishable` y `publishChecklist` reciben
`CourseContentFacts` como **segundo argumento obligatorio**. El compilador señala
los cinco puntos de llamada, y si alguno se equivoca, la dirección del fallo es la
segura: cero lecciones marca *pendiente*, nunca *publicable*.

### 2.3 El paso «Contenido» va al final y los números no se recalculan

`COURSE_WIZARD_STEPS` pasa a seis entradas fijas: `content` es siempre el 5 y
`review` siempre el 6. Un curso `SCHEDULED` no renumera nada, simplemente salta
del 4 al 6.

La alternativa —numerar por posición dentro de los pasos visibles— haría que
`/nuevo/5` significara «Contenido» o «Revisión» según una columna de la fila, y
`parseStepNumber` dejaría de ser función de la URL para pasar a depender de la
base. Lo que sí es relativo es lo que se le enseña a quien captura: el índice
numera por **posición visible**, así que un curso con sesiones lee «Paso 5 de 5»
en la revisión aunque viva en `/nuevo/6`.

Meterlo entre *Programa* y *Acceso*, como proponía el alcance, habría cambiado el
destino de `/nuevo/3` y `/nuevo/4` guardados. Solo se mueve la revisión, y por eso
`course-review-step.tsx` deja de desestructurar los pasos por posición: ahora los
pide por clave (`stepOfKey`), que es lo único que no cambia al insertar un paso.

### 2.4 El temario no viaja en el payload del curso

Cada paso del alta manda el curso entero, pero el contenido no. Guarda por su
cuenta, con `useFetcher`, contra `POST /dashboard/cursos/:documentId/contenido` y
sus propios intents. Si viajara en el payload, las reglas valibot de `courses`
tendrían que describir módulos y lecciones, y el contrato de entrada del contenido
dejaría de ser de su módulo. El precedente exacto es el panel de evaluaciones.

Esa misma ruta es la pantalla del curso ya publicado: el alta solo sirve
borradores, y un curso en línea también corrige su temario. Los dos montan el
mismo panel.

### 2.5 Borrar no existe: se archiva, y el orden se re-empaqueta

`archived_at` en los dos niveles, porque el avance por lección colgará de estas
filas y llevárselas dejaría huérfano el historial de quien ya las recorrió.

Un módulo con lecciones activas **no se archiva** (`CONTENT_MODULE_NOT_EMPTY`):
hacerlo en cascada escondería lecciones que nadie pidió esconder. Vaciarlo
primero es un gesto explícito.

Archivar deja un hueco en `order`, y la posición de la fila siguiente se calcula
contando. Sin re-empaquetar, la lección nueva nacería con el `order` de una que ya
existe. Por eso archivar escribe la baja **y** el orden de los hermanos que
quedan, en la misma transacción.

### 2.6 `order` sin `@@unique`, y la contigüidad la impone el dominio

```prisma
@@index([courseId, order])   // no @@unique
```

Reordenar reescribe varias filas y Postgres valida la unicidad por sentencia: la
restricción obligaría a una pasada intermedia con valores fuera de rango en cada
movimiento. La invariante real no es «no hay repetidos» sino «es contiguo desde 1
entre los activos», que un `@@unique` tampoco expresa. La produce
`resolveContentOrder`, que emite siempre 1..n y corre dentro de una transacción.

El costo aceptado: dos escrituras concurrentes sobre el mismo padre pueden dejar
dos filas con el mismo `order`. El árbol se sigue pintando y el siguiente
reordenamiento lo repara.

### 2.7 Reordenar recibe el orden nuevo COMPLETO

Nunca «sube uno». Un movimiento relativo depende de lo que el cliente creía tener
en pantalla, y dos pestañas abiertas lo convierten en una escritura sobre un
estado que ya cambió. El envío es una permutación exacta de lo guardado o no es
nada (`CONTENT_INVALID_ORDER`).

Las lecciones se comparan por la **unión** de todas las listas y no módulo a
módulo, porque mover una de módulo es un reordenamiento válido: así cambiar de
padre y cambiar de posición son la misma operación y no dos que puedan quedar a
medias.

### 2.8 El formato no prohíbe el temario

No existe un error por poner lecciones en un curso `SCHEDULED`. Lo que el formato
gobierna es el **pendiente de publicación** y la **visibilidad del paso**, no la
legalidad de la fila. Prohibirlo obligaría a borrar contenido al cambiar de
formato, que es justo lo que ADR-0011 §2.5 congeló para las sesiones.

Lo que sí manda el estado: el temario se edita en `DRAFT` y en `PUBLISHED`, y en
nada más. Es `canEdit`, la misma condición de la ficha, no una regla nueva.

## 3. Consecuencias

- Dos tablas nuevas, un enum y una relación inversa en `Course`. Todo aditivo:
  ninguna fila existente cambia de comportamiento.
- `PublishCheck` gana `content`, y con él rompen en compilación el `switch` de
  `publishCheckLabel` y el `Record` de `STEP_OF_CHECK` —que es donde se quiere—.
- `createCourseService` gana una dependencia obligatoria, `contentRepository`.
- `parseStepNumber("6")` deja de ser nulo: quien tuviera `/nuevo/6` guardado caía
  antes en el paso 1 y ahora cae en la revisión.
- Queda pendiente para el material de la lección: `lesson_content`, su fuente de
  referencias de storage y el `type` que hoy solo se guarda.
- Queda pendiente para el avance por lección: el término de contenido de
  `isCompleted`, el valor `BOTH` y relajar la exigencia de evaluación de
  ADR-0011 §2.4.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Publicar un autogestivo sin ninguna lección | `COURSE_WITHOUT_LESSONS` |
| Tocar el temario de un curso finalizado o cancelado | `CONTENT_COURSE_NOT_EDITABLE` |
| Archivar un módulo con lecciones activas | `CONTENT_MODULE_NOT_EMPTY` |
| Un orden que no es permutación exacta de lo guardado | `CONTENT_INVALID_ORDER` |
| Pasar del tope de módulos por curso o de lecciones por módulo | `CONTENT_TOO_MANY_MODULES` · `CONTENT_TOO_MANY_LESSONS` |
| Un módulo o una lección de otro curso | `CONTENT_MODULE_NOT_FOUND` · `CONTENT_LESSON_NOT_FOUND` |
