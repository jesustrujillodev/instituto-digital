# ADR 0022 · Los capacitadores se administran desde Usuarios

**Estado:** aceptado · 2026-09-28
**Contexto del cambio:** MVP-02 · la sección «Capacitadores» duplicaba la tabla de usuarios
**Enmienda:** [ADR-0002](./0002-perfil-de-capacitador-y-transaccion-entre-modulos.md) (dónde
se administra el perfil; el modelo no cambia)

## 1. Contexto

El perfil de capacitador es una extensión de la cuenta, no un rol (ADR-0002). Aun así tenía
su propia sección en el menú, `/dashboard/capacitadores`, con su tabla, sus filtros y su
ficha. Tres problemas:

- **Dos tablas para las mismas personas.** Un titular buscaba a alguien en Usuarios para
  editar su cuenta y en Capacitadores para editar su perfil.
- **Un capacitador sin rol de gestión veía la sección** en modo consulta. Ninguna tarea suya
  la necesitaba: asignar capacitadores a un curso usa su propio selector (`findActive`).
- **Habilitar a alguien pasaba por un selector de 100 personas** dentro de un diálogo, en vez
  de partir de la persona.

## 2. Decisiones

### 2.1 Sin pantalla propia

Se retiran `/dashboard/capacitadores`, `/nuevo` y `/:documentId/editar`, sin redirección, y
sus dos entradas del menú. Todo enlace que llevaba ahí lleva a
`/dashboard/usuarios?trainer=yes`.

La tabla de usuarios gana lo que tenía el catálogo:

- la especialidad bajo el nombre y la insignia «Capacitador»;
- un filtro con «Capacitadores», «Capacitadores externos» (`type=EXTERNAL`) y «Sin perfil»;
- en el menú de cada fila, «Habilitar como capacitador», «Editar perfil de capacitador» y
  «Deshabilitar como capacitador»;
- en el panel de detalle, una sección con el perfil y sus estadísticas.

Quedan dos rutas del módulo `trainers`, colgadas de Usuarios:
`/dashboard/usuarios/capacitador-externo` (el alta) y
`/dashboard/usuarios/:documentId/perfil-capacitador` (solo action). La cuenta del action
sale de la URL, nunca del formulario.

### 2.2 El listado incluye a los externos

Un externo no pertenece a ninguna dependencia, así que el alcance de un titular no lo
alcanza. Pero el titular tiene que verlo: puede asignarlo y administrar su perfil
(`canManageTrainer`, ADR-0002).

`listScopeWhere` amplía el alcance de dependencia con `type = EXTERNAL` **solo para leer la
lista**. Las escrituras de la cuenta siguen acotadas por `scopeWriteWhere`: sobre un externo,
el titular ve las acciones del perfil y no las de la cuenta. Cada fila llega con `canManage` y
`canManageTrainer` ya decididos para no ofrecer lo que el servidor rechazaría.

El filtro por rol «Participantes» deja fuera a los externos: llevan `USER` en la base, pero
no cursan.

### 2.3 El perfil completa la página, no la descubre

`trainerService.listByUsers(ids)` recibe las cuentas que el listado de usuarios ya recortó
por alcance, y no lleva alcance propio. Las estadísticas de toda la página salen en dos
consultas (`findByUserDocumentIds`), no en dos por persona.

## 3. Consecuencias

- Desaparecen `canViewCatalog`, el listado paginado del catálogo y sus reglas de orden. El
  capacitador sin rol de gestión conserva Cursos e Impartición.
- `forbiddenRole` sigue existiendo: lo usan Cursos, Impartición, Grupos e Inscripciones.
- La semblanza ahora se puede vaciar (`bio: null` en `updateProfileRule`).

## 4. Alternativas descartadas

- **Redirigir `/dashboard/capacitadores`.** Una URL que solo redirige es otra superficie que
  mantener; el cliente pidió retirarla.
- **Una segunda consulta de externos fusionada en el cliente.** Rompería la paginación y el
  orden, que son del servidor.
- **Proyectar el perfil dentro de `SafeUser`.** `SafeUser` alimenta el token y el refresh;
  meterle especialidad y estadísticas cargaría cada inicio de sesión con datos que solo usa
  una tabla.
