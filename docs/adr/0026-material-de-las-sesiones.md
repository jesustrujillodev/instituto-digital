# ADR 0026 · Material de las sesiones

**Estado:** aceptado · 2026-09-28
**Contexto del cambio:** MVP-02 · apoyo para las sesiones presenciales y en línea
**Relacionado:** [ADR-0013](./0013-material-de-la-leccion.md) (material de la lección),
[ADR-0025](./0025-modalidad-y-como-se-imparte.md) (sesiones del híbrido autogestivo)

## 1. Contexto

Una sesión, presencial o en línea, necesita a veces un documento, un video o un enlace: la
presentación, una lectura previa, la grabación. El temario (ADR-0012 a 0014) ya sabe guardar
ese material, pero una lección se **recorre**: tiene avance por participante y puede decidir
quién completa el curso. El material de una sesión es apoyo, no algo que se completa.

## 2. Decisiones

### 2.1 Cuelga de la sesión, no del temario

`SessionMaterial` pertenece a `CourseSession` (`onDelete: Cascade`), con tipo `FILE`, `VIDEO` o
`LINK`, un nombre y las mismas columnas de archivo y enlace que `LessonContent`. No tiene
avance ni entra en ninguna regla de completado. Meterlo en el temario obligaría a todo curso
con sesiones a tener aula y paso Contenido para subir un PDF.

Las sesiones conservan su identidad al guardar (`syncSessions` diferencia por `documentId`),
así que el material sobrevive a cambios de fecha, horario o lugar.

### 2.2 Reusa el mecanismo del material de lecciones

Mismas listas de tipos y topes (`LESSON_FILE`, `LESSON_VIDEO`), misma subida firmada directa
al bucket con `statObject` al confirmar, misma firma de lectura (`signReference`). Prefijo
privado propio, `documentos/sesiones/`, con su fuente de referencias para el gestor de la
nube. La key se valida contra ese prefijo: una key de otro módulo no se acepta.

### 2.3 Lo administra quien edita el curso y quien lo imparte

`sessionMaterialCourseWhere` une el alcance de escritura del curso con el de impartición: el
titular, el auxiliar, quien lo creó y el capacitador asignado. Se cambia mientras el curso es
borrador o publicado; finalizado o cancelado queda como está
(`CONTENT_SESSION_MATERIALS_LOCKED`). Tope de 20 por sesión
(`CONTENT_TOO_MANY_SESSION_MATERIALS`).

Se administra desde el paso Programa del alta (botón por sesión guardada) y desde la pestaña
Material de Impartición. Las dos montan la misma hoja contra la misma ruta de recurso,
`/dashboard/cursos/:id/sesiones/material`.

### 2.4 Cuándo lo ve el participante

Solo quien está inscrito (`ENROLLED`); una baja deja de verlo. Se ve desde que se publica el
curso, salvo que el material tenga marcada la casilla «Disponible a partir de la sesión»
(`availableFromSession`): entonces, hasta que la sesión empieza, el participante ve que existe
y cuándo se abre, pero el servidor **no envía sus enlaces**. La espera no depende de que la
interfaz lo esconda.

### 2.5 Quitar una sesión borra su material

La fila cae en cascada. El servicio de cursos lee antes las referencias del material de las
sesiones que se quitan y suelta los objetos después del commit, best-effort como la portada.
El alta avisa antes de quitar una sesión con material.

## 3. Rechazos

| Situación | Código |
| --- | --- |
| Sesión que no es del curso | `CONTENT_SESSION_NOT_FOUND` |
| Material que no es del curso | `CONTENT_SESSION_MATERIAL_NOT_FOUND` |
| Más de 20 materiales en una sesión | `CONTENT_TOO_MANY_SESSION_MATERIALS` |
| Curso finalizado o cancelado | `CONTENT_SESSION_MATERIALS_LOCKED` |
