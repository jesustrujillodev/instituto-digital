# Verificación manual · PRD-01 a PRD-08 y MVP-02

Recorridos que confirman que cada PRD está entregado. Salen de la sección de
verificación de cada plan. El MVP-02 se añade por feature, no por PRD.

## Preparación común

```bash
bunx prisma migrate status
bun run typecheck
bun run lint
bun run test
bun run seed
bun run dev
```

- `bun run seed` borra todo y vuelve a sembrar: **resembrar antes de cada recorrido**,
  porque cada uno modifica datos que el siguiente da por intactos.
- `test:coverage` no es puerta: sus umbrales fallan a sabiendas desde PRD-01.
- Todas las cuentas usan la contraseña `Password123!`.
- Los `documentId` que piden algunos pasos se sacan de `bunx prisma studio`.

### Qué deja la semilla

Cada dependencia activa tiene la misma plantilla; el correo es
`<nombre>.<slug>@instituto.gob.mx`.

| Dependencia | Slug | Estado |
| --- | --- | --- |
| Secretaría de Obras Públicas (SOP) | `sop` | Activa |
| Secretaría de Desarrollo Social (SEDESOL) | `sds` | Activa |
| Instituto Municipal de Cultura (IMC) | — | Desactivada |

| Persona | Rol |
| --- | --- |
| Laura | `DEPENDENCY_HEAD` (titular) |
| Carlos | `DEPENDENCY_DEPUTY` (auxiliar) |
| Diana | `USER` (participante) |
| Miguel | `USER` (participante) |

Además:

- `super@instituto.gob.mx` — `SUPERADMIN`.
- Perfiles de capacitador: `carlos.sop` (activo), `diana.sds` (activo), `miguel.sop` (desactivado).
- Capacitadores externos: `elena.torres@universidad.mx`, `raul.beltran@consultoria.mx`.
- Grupos en SOP: "Mandos medios" (con todo el personal interno de SOP) y "Brigadistas" (vacío).
- Grupo en SEDESOL (PRD-04): "Enlaces administrativos" con `carlos.sds`, `miguel.sds` y `laura.sds`.

Cursos que añade PRD-04, todos publicados:

| Curso | Organiza | Acceso | Situación |
| --- | --- | --- | --- |
| Protección civil básica | SEDESOL (`diana.sds`) | Por invitación | Cupo 2, `carlos.sds` inscrito; sesión 22 oct |
| Redacción de oficios | SOP | Público | Cupo 1, lleno con `diana.sop`; sesión 28 oct |
| Ética pública | SOP | Público | Límite de inscripción vencido (10 sep); sesión 15 oct |
| Inducción institucional | SOP | Público | Empezó el 14 sep; `miguel.sop` inscrito |

Curso que añade PRD-05, publicado:

| Curso | Organiza | Acceso | Situación |
| --- | --- | --- | --- |
| Archivo y transparencia | SEDESOL (`diana.sds`) | Por invitación | Híbrido; `diana.sop` inscrita, `miguel.sop` invitado; sesiones 27 oct y 3 nov, 17:00 |

Cursos que añade PRD-06, los dos de SOP, impartidos por `carlos.sop`:

| Curso | Estado | Situación |
| --- | --- | --- |
| Seguridad en obra | Publicado, con evaluación | Sesiones 1, 2 y 3 sep (ya pasaron). `diana.sop` 3/3 y aprobada con 92; `miguel.sop` 2/3 (faltó el 2) y resultado **pendiente** |
| Primeros auxilios | Finalizado, sin evaluación | Sesiones 11 y 13 ago. `diana.sop` 2/2, completó y tiene crédito para SOP en 2026; `miguel.sds` 1/2. Valoraciones 5 (con comentario) y 3 |

Curso que añade F-01 del MVP-02, publicado:

| Curso | Organiza | Acceso | Situación |
| --- | --- | --- | --- |
| Marco normativo municipal en línea | SEDESOL (`diana.sds`) | Público | **Autogestivo**: sin ninguna sesión, con evaluación. Se completa al aprobar |

Planes que añade PRD-07, los dos de SOP:

| Plan | Líneas |
| --- | --- |
| 2026 | Primeros auxilios (ago, vinculada al curso finalizado → **realizada**), Seguridad en obra (sep, vinculada al publicado → **programada**), Presupuestos de obra pública (oct, **pendiente**), Topografía básica (nov, **cancelada**) |
| 2025 | Normatividad de obra pública (may). **Solo lectura** |

---

## PRD-01 · Cuentas, dependencias y roles

En este recorrido **A = SOP** y **B = SEDESOL**.

- [ ] **1. Dependencias y titulares.** Como `super@`: crear una dependencia nueva y
  designar su titular. Designar un segundo titular en SOP (ya tiene a `laura.sop`)
  → falla con copia propia, **no** con "ese correo ya está registrado".
- [ ] **2. Aislamiento del listado.** Como `laura.sop`: `/dashboard/usuarios` muestra
  solo personal de SOP; `/dashboard/dependencias` da **403** con
  `requiredRoles: ["SUPERADMIN"]`.
- [ ] **3. Alta desde el titular.** Como `laura.sop` en `/dashboard/usuarios/nuevo`: el
  selector de dependencia está fijo en SOP; sin número de empleado el formulario
  falla en el campo.
- [ ] **4. Usuario ajeno por URL.** Como `laura.sop`:
  `/dashboard/usuarios/<documentId de alguien de SEDESOL>/editar` → **404**.
- [ ] **5. Designar auxiliar.** `laura.sop` designa auxiliar a `diana.sop`. Como
  `carlos.sop` (auxiliar), no aparece la acción de designar auxiliares.
- [ ] **6. Titular no cambia de dependencia.** `laura.sop` intenta cambiarse de
  dependencia en `/dashboard/perfil` → bloqueado.
- [ ] **7. Cambio de dependencia de un participante.** `miguel.sop` se cambia a
  SEDESOL: es inmediato, queda en el historial y el alcance nuevo aplica sin volver
  a iniciar sesión.
- [ ] **8. Archivar.** Con una sesión de `diana.sop` abierta en otro navegador,
  archivarla: la sesión muere en la siguiente petición y el login responde
  "credenciales inválidas".
- [ ] **9. Dependencia desactivada.** IMC no admite altas; su historial sigue consultable.
- [ ] **10. Lockdown `except-admin`.** Activarlo desde `/dashboard/sesiones`: el
  superadministrador sigue dentro y el titular sale.

---

## PRD-02 · Capacitadores y grupos

**Resembrar antes de empezar.** En este recorrido **A = SEDESOL** y **B = SOP**,
para no chocar con el perfil de `carlos.sop` ni con los grupos que la semilla deja
en SOP.

- [ ] **1. Activar perfil.** `laura.sds` activa el perfil de capacitador a
  `carlos.sds`. Él recarga y ya tiene "Capacitadores" en el menú, sin volver a entrar.
- [ ] **2. Catálogo compartido.** `carlos.sds` abre el catálogo y ve también a los de
  SOP (`carlos.sop`).
- [ ] **3. Participante sin perfil.** `miguel.sds` abre `/dashboard/capacitadores` → **403**.
- [ ] **4. Externo.** `laura.sds` registra un capacitador externo con institución.
  Iniciar sesión con él: entra, ve su perfil y no tiene cambio de dependencia.
- [ ] **5. Externo por la vía equivocada.** Dar de alta un externo desde
  `/dashboard/usuarios/nuevo` → falla con mensaje propio.
- [ ] **6. Desactivar perfil.** Desactivar el perfil de `carlos.sds`: sale del
  catálogo, pierde el enlace del menú en la siguiente petición y su cuenta sigue igual.
- [ ] **7. Crear grupo.** `laura.sds` crea el grupo "Mandos medios": el buscador solo
  ofrece personal de SEDESOL. Añadir a `diana.sds` y `miguel.sds`.
- [ ] **8. Nombre único por dependencia.** Un segundo "Mandos medios" en SEDESOL →
  falla. El mismo nombre en SOP ya existe por la semilla, así que el paso 7
  funcionando demuestra que conviven.
- [ ] **9. Miembro que cambia de dependencia.** `miguel.sds` se cambia a SOP desde
  `/dashboard/perfil`: sigue en el grupo, mostrado con su dependencia nueva.
- [ ] **10. Superadministrador.** `super@` en `/dashboard/grupos`: ve los de SEDESOL y
  los de SOP, sin escritura.

---

## PRD-03 · Cursos, sesiones y acceso

**Resembrar antes de empezar.** En este recorrido **A = SOP** y **B = SEDESOL**.

Verificación automática del módulo:

- `bun run test app/modules/courses` y `bun run test app/lib`.
- `bun run typecheck` — obligatorio tras tocar `app/routes.ts` (corre `react-router typegen`).

Pendiente del plan: la documentación de §9 (`docs/courses/00-cursos-sesiones-y-acceso.md`
y `docs/adr/0003-alcance-de-cursos-y-audiencia.md`). No bloquea el recorrido.

- [ ] **1. Crear en borrador.** Como `laura.sop`: crear un curso híbrido restringido a
  SOP y SEDESOL, con 3 sesiones, cupo 20 y evaluación. Guardar en borrador.
- [ ] **2. Publicar sin capacitador.** Intentar publicarlo → el error sale con su
  copia, la pantalla sigue en pie y el curso sigue en borrador.
- [ ] **3. Publicar con una sesión incompleta.** Asignar un capacitador del catálogo
  (`carlos.sop` o Elena Torres), quitarle la sede a una sesión y publicar → falla
  señalando **qué sesión**.
- [ ] **4. Publicar.** Completar y publicar → estado `publicado` y `publishedAt` escrito.
- [ ] **5. Editar publicado.** Mover una sesión y añadir una cuarta. En
  `bunx prisma studio`, las tres originales **conservan su `documentId`** — es lo que
  PRD-06 necesita.
- [ ] **6. Cancelar.** Estado `cancelado`; sus sesiones y capacitadores quedan intactos.
- [ ] **7. Capacitador interno.** Como `diana.sds` (rol `USER`, perfil activo): entra a
  `/dashboard/cursos`, ve solo los que creó, puede crear uno en su dependencia y
  **no** puede editar el de `laura.sop` ni por URL directa → **403** con la barra
  lateral intacta.
- [ ] **8. Capacitador externo.** Como `elena.torres`: `/dashboard/cursos` responde **403**.
- [ ] **9. Superadministrador.** Como `super@`: crear un curso eligiendo la dependencia
  organizadora; es el único que ve ese selector.
- [ ] **10. Zona horaria.** Una sesión de **noviembre** capturada a las 09:00 se
  muestra a las 09:00 al recargar.

---

## PRD-04 · Inscripción e invitaciones

**Resembrar antes de empezar.** En este recorrido **A = SOP** y **B = SEDESOL**. Las
fechas de la semilla suponen que hoy cae entre el 14 de septiembre y el 15 de
octubre de 2026.

Verificación automática del módulo:

- `bun run test app/modules/enrollments`, `bun run test app/modules/courses` y
  `bun run test app/modules/groups`.
- `bun run typecheck` — obligatorio tras tocar `app/routes.ts`.
- `bunx prisma db push` antes de sembrar: PRD-04, como PRD-03, no trae migración.

- [ ] **1. Cursos disponibles.** Como `miguel.sds`: `/dashboard/cursos-disponibles`
  muestra "Atención ciudadana" y "Redacción de oficios"; **no** muestra borradores,
  "Liderazgo para mandos medios" (cancelado), "Ética pública" (cerrado) ni
  "Protección civil básica" (por invitación).
- [ ] **2. Invitación por URL.** Como `miguel.sds`:
  `/dashboard/cursos-disponibles/<documentId de Protección civil básica>` → **404**.
- [ ] **3. Inscripción propia.** `miguel.sds` se inscribe a "Atención ciudadana":
  aparece en `/dashboard/mis-cursos` → Próximos, con sede y estado "Inscrito".
  Enviar de nuevo desde otra pestaña abierta antes → mensaje "ya estás inscrito".
- [ ] **4. Sin cupo.** `miguel.sds` intenta inscribirse a "Redacción de oficios"
  (cupo 1, lleno) → falla con copia propia y el curso sigue 1/1.
- [ ] **5. Inscripción cerrada.** Como `miguel.sop`, abrir "Ética pública" por URL:
  se ve el detalle, sin botón de inscribirse y con el aviso de que la inscripción
  cerró el 10 de septiembre.
- [ ] **6. Baja y reinscripción.** `miguel.sds` se da de baja de "Atención ciudadana"
  y se vuelve a inscribir. En `bunx prisma studio` hay **una sola** fila de
  `enrollments` para ese par, con el mismo `documentId`.
- [ ] **7. Baja después de empezar.** Como `miguel.sop`: "Inducción institucional"
  aparece En curso y no ofrece darse de baja.
- [ ] **8. Asignación.** `laura.sop` abre "Atención ciudadana" (de SEDESOL, pública)
  → **Inscribir a mi personal**. La pestaña Personas solo ofrece personal de SOP,
  no hay botón Invitar (el curso no es por invitación) y la lista de abajo solo
  muestra gente de SOP. Inscribe a `carlos.sop`, que lo ve en Mis cursos como
  inscrito por asignación. La miga "Cursos disponibles" la regresa al catálogo.
- [ ] **8b. Inscribir un grupo.** En la misma vista, pestaña **Grupos**: al marcar
  un grupo, el pie dice cuántos lugares ocuparía. Si no caben, lo dice en rojo y
  **Inscribir** queda deshabilitado antes de enviar.
- [ ] **9. Invitar a un grupo (§9, paso 5).** Como `diana.sds` (capacitadora, rol
  `USER`): en `/dashboard/cursos` abrir "Protección civil básica" → botón
  **Inscripciones** → invitar al grupo "Enlaces administrativos" → aviso
  "2 invitados, 1 omitido" (`carlos.sds` ya estaba inscrito).
- [ ] **10. Invitar no aparta lugar.** El curso sigue con "1 de 2 lugares".
  `miguel.sds` ve la invitación en Mis cursos, **acepta** y queda inscrito: el
  curso pasa a "Lleno (2/2)" y aparece en su pestaña Próximos.
- [ ] **11. Aceptar sin cupo y rechazar.** `laura.sds` intenta aceptar → falla por
  cupo. **Rechaza**: la invitación desaparece de Mis cursos y la fila queda
  `DECLINED` (sigue viendo el curso por ser titular de la dependencia organizadora).
- [ ] **12. Cupo al editar.** `laura.sds` edita "Protección civil básica" con cupo 1
  → falla porque ya hay 2 inscritos.
- [ ] **13. Cambio de dependencia.** `miguel.sds` se cambia a SOP en
  `/dashboard/perfil`: "Protección civil básica" sigue en Mis cursos y abre por URL.
- [ ] **14. Quién no se inscribe.** `elena.torres` y `super@` en
  `/dashboard/cursos-disponibles` → **403**. `super@` sí ve la lista de inscritos en
  `/dashboard/cursos/<Protección civil básica>/inscripciones`.

---

## PRD-05 · Calendario

**Resembrar antes de empezar.** En este recorrido **A = SOP** y **B = SEDESOL**. Las
fechas de la semilla suponen que hoy cae en septiembre de 2026, así que "Hoy" abre
septiembre. Se cambia de mes con las flechas o con `?month=2026-10`.

Verificación automática del módulo:

- `bun run test app/modules/calendar` y `bun run test app/shared/layout`.
- `bun run typecheck` — obligatorio tras tocar `app/routes.ts`.
- PRD-05 no cambia el schema: no hace falta `db push` ni migración.

Cómo leer el calendario: cada sesión es un chip con hora y título. El color dice
por qué te toca (la leyenda aparece cuando hay más de un motivo). Una invitación
pendiente va con **borde punteado** y un borrador lleva el prefijo "Borrador ·".
Al hacer clic se abre un panel lateral.

- [ ] **1. Participante (§9, paso 7).** Como `miguel.sop` en `/dashboard/calendario`:
  septiembre muestra "Inducción institucional" el 14 y el 28. En octubre aparece
  "Archivo y transparencia" el 27 con **borde punteado**. **No** aparecen "Ética
  pública" (pública, pero no inscrito) ni "Liderazgo para mandos medios" (cancelado,
  8 oct).
- [ ] **2. Panel y detalle.** En el paso anterior, abrir "Archivo y transparencia":
  muestra horario 17:00–19:00, "Híbrida", sede, enlace, a `diana.sds` y la etiqueta
  "Invitación pendiente". "Ver curso" lleva a
  `/dashboard/cursos-disponibles/<id>` con Aceptar y Rechazar.
- [ ] **3. Inscribirse lo pone en el calendario (§7.7).** `miguel.sop` acepta la
  invitación en Mis cursos y vuelve al calendario: el 27 de octubre deja de estar
  punteado y noviembre muestra la sesión del 3, **sin ningún paso adicional**.
- [ ] **4. Zona horaria.** La sesión del 3 de noviembre (ya en horario estándar)
  se muestra a las **17:00**, igual que la del 27 de octubre (horario de verano).
- [ ] **5. Capacitador interno.** Como `diana.sds` (rol `USER`, perfil activo):
  - En octubre están "Atención ciudadana" (solo "Impartes"; "Ver curso" lleva a
    cursos-disponibles) y "Protección civil básica" ("Impartes" y "Organizas";
    "Ver curso" lleva a `/dashboard/cursos/<id>/editar`).
  - En noviembre aparece "Borrador · Taller de lenguaje claro" el 5, que ella creó.
  - **No** aparece el borrador "Gestión documental en obra pública", que es de SOP.
- [ ] **6. Capacitador externo.** Como `elena.torres`: septiembre muestra
  "Inducción institucional" y el panel **no** ofrece "Ver curso". En noviembre
  **no** aparece "Gestión documental en obra pública": la imparte, pero es borrador.
  En octubre no aparece "Liderazgo para mandos medios" (cancelado).
- [ ] **7. Titular y su personal.** Como `laura.sop` en octubre:
  - Aparecen "Ética pública" y "Redacción de oficios".
  - Al marcar **"Incluir cursos de mi personal"** aparece "Archivo y transparencia"
    el 27, con la etiqueta "Participa tu personal" y sin "Ver curso".
  - Aparece el filtro **Dependencia**: al elegir Secretaría de Desarrollo Social
    solo queda "Archivo y transparencia".
  - En noviembre, sin el interruptor, están los borradores "Gestión documental en
    obra pública" (17 a 19) y, en los días grises de diciembre, "Seguridad en sitio
    de obra".
- [ ] **8. Roles acumulados.** Como `carlos.sop` (auxiliar y capacitador) en
  octubre: "Redacción de oficios" sale **una sola vez** y el panel lleva
  "Organizas" e "Impartes".
- [ ] **9. Superadministrador.** Como `super@` en noviembre:
  - Ve los borradores de las dos dependencias ("Taller de lenguaje claro" y
    "Gestión documental en obra pública").
  - El filtro Dependencia recorta a una sola.
  - **No** aparece el interruptor de personal.
- [ ] **10. Cancelar lo saca del calendario.** `laura.sop` cancela "Ética pública"
  desde `/dashboard/cursos`: desaparece del 15 de octubre en su calendario y en el
  de `carlos.sop`.
- [ ] **11. Cambio de dependencia del personal.** `diana.sop` se cambia a SEDESOL
  en `/dashboard/perfil`:
  - En el calendario de `laura.sop`, con el interruptor marcado, "Archivo y
    transparencia" **ya no aparece**. No se borró nada: Diana ya no es su personal.
  - `laura.sds`, con el interruptor, lo ve con "Organizas" y "Participa tu personal".
  - `diana.sop` lo sigue viendo en su calendario y en Mis cursos.
- [ ] **12. Vista de lista y filtros.** Con `?view=list` (botón "Lista"), octubre se
  agrupa por día. Filtrar por modalidad "En línea" deja la lista vacía con su
  mensaje. "Hoy" vuelve a septiembre y conserva la vista.
- [ ] **13. Pantalla angosta.** A 375 px de ancho, la cuadrícula muestra un punto con
  el número de sesiones por día. Al tocarlo se abre la lista del día, y cada sesión
  abre el panel.
- [ ] **14. Parámetros inválidos.** `/dashboard/calendario?month=2026-13` y
  `?view=semana` responden **400** con mensaje propio y la barra lateral intacta.

## PRD-06 · Impartición, créditos y valoración

**Resembrar antes de empezar.** Supone que hoy es septiembre de 2026, después del
3: la ventana de cierre de "Seguridad en obra" ya está abierta.

Verificación automática:

- `bun run test app/modules/teaching app/modules/credits app/modules/ratings`.
- `bun run test app/modules/trainers app/modules/enrollments app/shared/layout app/lib`.
- `bun run typecheck`.
- El schema cambió: `bunx prisma db push` y `bunx prisma generate` antes de sembrar.
  Ahora añade `course_evaluations` y `evaluation_results`.

- [ ] **1. Lo que imparte.** Como `carlos.sop` en `/dashboard/imparticion`: aparecen
  "Seguridad en obra" (Publicado) y "Primeros auxilios" (Finalizado), y **no**
  aparecen borradores ni cancelados. Al abrir "Seguridad en obra", "Finalizar" está
  deshabilitado con "Falta capturar el resultado de 1 persona(s)."
- [ ] **2. Pasar lista (§9, paso 8).** En la pestaña Asistencia, elegir la sesión 2:
  `miguel.sop` está sin marcar. Marcarlo y guardar muestra "Lista guardada: 1
  cambio." y su avance pasa a 3/3 · 100 %. Guardar otra vez sin tocar nada muestra
  "No había cambios que guardar."
- [ ] **3. Resultados.** En Resultados, poner a `miguel.sop` "No aprobado" con nota
  60 y guardar. La nota se deshabilita si se elige "Pendiente". En Completado,
  `diana.sop` dice "Completaría" y `miguel.sop` "No completa".
- [ ] **3b. Evaluaciones.** En la pestaña Evaluaciones de "Seguridad en obra"
  (aparece porque el curso requiere evaluación; en "Primeros auxilios", que no la
  requiere, **no** aparece):
  - El selector trae "Práctica de campo · Sesión 2" y "Proyecto final · Sin
    sesión". La primera dice "Capturadas 2 de 2"; la segunda, "Capturadas 0 de 2",
    porque `miguel.sop` solo tiene observación y ningún veredicto.
  - Añadir "Examen parcial" sin sesión: aparece en el selector y su lista sale
    entera en "Sin capturar".
  - Poner a `diana.sop` "Aprobado" y a `miguel.sop` "No aprobado" con una
    observación; guardar muestra "Evaluación guardada: 2 cambios." Guardar otra
    vez sin tocar nada muestra "No había cambios que guardar."
  - Cambiar **solo** la observación y guardar vuelve a decir "1 cambio".
  - Volver a `miguel.sop` a "Sin capturar" y vaciar su observación: tras guardar,
    en `bunx prisma studio` su fila de `evaluation_results` ya no existe.
  - Elegir "Sin capturar" **no** borra el texto escrito en la observación.
  - Eliminar "Examen parcial" pide confirmación y se lleva sus capturas.
  - **El cierre no cambia:** con evaluaciones a medio capturar, "Finalizar" sigue
    habilitado o no según el resultado final de la pestaña Resultados.
- [ ] **4. Finalizar (§7.4).** Pulsar Finalizar y confirmar: "Curso finalizado: 1
  persona completó y se otorgó 1 crédito." El curso queda Finalizado y la pestaña
  Completado dice "Completó" para Diana.
- [ ] **5. Créditos del participante (§9, paso 9).** Como `diana.sop` en
  `/dashboard/mis-creditos`: ejercicio 2026 con **2**, acumulado **2**, y la lista
  con "Seguridad en obra" y "Primeros auxilios", las dos para Secretaría de Obras
  Públicas.
- [ ] **6. Valorar.** Como `diana.sop` en Mis cursos, pestaña Finalizados:
  - "Seguridad en obra" muestra "Completado · 1 crédito" y "nota 92".
  - "Valorar curso" pide estrellas; sin elegir, el botón está deshabilitado. Con
    4 y un comentario, avisa "Gracias por valorar el curso." y la tarjeta cambia
    a "Lo valoraste con 4 de 5".
  - "Primeros auxilios" ya dice "Lo valoraste con 5 de 5".
  - **Ninguna observación de evaluación aparece.** Buscar "Aplicó el protocolo"
    en el código fuente de la página no devuelve nada.
- [ ] **7. No completar no impide valorar.** Como `miguel.sop`, "Seguridad en obra"
  dice "No completado" y ofrece "Valorar curso". Como `miguel.sds`, "Primeros
  auxilios" dice "Asististe a 1 de 2 sesiones" y "Lo valoraste con 3 de 5".
- [ ] **8. Valoraciones anónimas (§9, paso 10).** Como `carlos.sop`, la ficha de
  "Seguridad en obra" tiene la pestaña Valoraciones con "4.0 de 5 · 1 valoración"
  y el comentario **sin nombre**.
- [ ] **9. Ficha del capacitador.** Como `laura.sop` en `/dashboard/capacitadores`,
  abrir a Carlos: "2 curso(s) impartido(s)" y "4.0 de 5" (5, 3 y 4).
- [ ] **10. Corrección posterior.** Como `laura.sop`, en la ficha de "Seguridad en
  obra" aparece el aviso de que cada corrección recalcula los créditos:
  - Desmarcar a `diana.sop` en la sesión 1 y guardar: en Completado dice "No
    completa", y en Mis créditos de Diana el ejercicio 2026 baja a **1**.
  - Volver a marcarla: regresa a **2**. En `bunx prisma studio`, `credits` sigue
    teniendo **una** fila para Diana y ese curso, con `revoked_at` vacío y
    `granted_by_id` de Laura.
- [ ] **10b. Evaluaciones de un curso finalizado.** Como `carlos.sop` (solo
  capacitador), la pestaña Evaluaciones de "Seguridad en obra" ya finalizada es de
  solo lectura: no hay formulario de alta ni botones de editar o eliminar, y los
  selectores están deshabilitados. Como `laura.sop` sí puede corregir, y tras
  guardar, `recorded_by_id` de esa fila pasa a ser el suyo en `bunx prisma studio`.
- [ ] **11. Resultado corregido.** Como `laura.sop`, en Resultados de "Seguridad en
  obra" ya no se ofrece "Pendiente". Cambiar a Diana a "No aprobado" retira su
  crédito; volver a "Aprobado" lo restaura.
- [ ] **12. Créditos del personal (§9, paso 10).** Como `laura.sop` en
  `/dashboard/creditos`: tabla de Obras Públicas, ejercicio 2026, con `diana.sop` en
  2 y el resto del personal en 0. `?dependencia=<id de SEDESOL>` en la URL **no**
  cambia la tabla.
- [ ] **13. El crédito no se muda (§7.5, §9 paso 11).** `diana.sop` se cambia a
  SEDESOL en `/dashboard/perfil`:
  - En Créditos de `laura.sop` sigue con **2** y la etiqueta "Transferido".
  - En Créditos de `laura.sds` aparece con **0**.
  - En Mis créditos de Diana, los dos siguen diciendo Secretaría de Obras Públicas.
  - Una corrección de Laura que retire y restaure su crédito lo deja en Obras
    Públicas.
- [ ] **14. Superadministrador.** Como `super@` en `/dashboard/creditos`: resumen por
  dependencia con Obras Públicas en 2 créditos y 1 persona, y Desarrollo Social en
  0. Al hacer clic en Obras Públicas se abre su tabla de personal con "Todas las
  dependencias" para volver. En `/dashboard/imparticion` ve los cursos de todas las
  dependencias.
- [ ] **15. Guards.**
  - `diana.sop` en `/dashboard/imparticion` y `/dashboard/creditos` recibe **403**.
  - `elena.torres` (externa) entra a Impartición y solo ve "Inducción
    institucional", que imparte. En `/dashboard/mis-creditos` recibe **403**.
  - El menú de `diana.sop` muestra "Mis créditos" y no "Impartición" ni "Créditos".
- [ ] **16. Parámetros inválidos.** `/dashboard/imparticion/no-es-uuid` responde
  **400** y `/dashboard/imparticion/<id de un borrador>` responde **404**, los dos
  con la barra lateral intacta.

## PRD-07 · Plan anual

**Resembrar antes de empezar.** Supone que hoy es septiembre de 2026.

Verificación automática:

- `bun run test app/modules/annual-plan app/modules/courses app/shared/layout`.
- `bun run typecheck`.
- El schema cambió: `bunx prisma db push` y `bunx prisma generate` antes de sembrar.

- [ ] **1. Planes.** Como `carlos.sop` en `/dashboard/plan-anual`: aparecen 2026
  ("1 de 3 realizadas (33 %)") y 2025 con "Solo lectura". Solo se ofrece
  **"Crear plan 2027"**.
- [ ] **2. Estados derivados (§7.6).** En el plan 2026:
  - Primeros auxilios está Realizada;
  - Seguridad en obra, Programada, con el curso enlazado;
  - Presupuestos, Pendiente;
  - Topografía, Cancelada.

  La pestaña **Por mes** muestra los doce meses, con las líneas en agosto,
  septiembre, octubre y noviembre.
- [ ] **3. Crear plan y líneas (§9, paso 3).** "Crear plan 2027" avisa "Plan 2027
  creado." y el botón desaparece. En el plan 2027, "Nueva línea" con título
  "Excel intermedio", marzo, En línea y "3 semanas": aparece Pendiente y el avance
  dice "0 de 1 realizadas (0 %)".
- [ ] **4. Crear curso desde la línea (§9, paso 4).** En Presupuestos de obra
  pública (2026), "Crear curso":
  - lleva a `/dashboard/cursos/nuevo?linea=…` con el título y la modalidad En línea
    precargados y el aviso "El curso se vinculará a la línea…";
  - al guardar el borrador, la línea pasa a **Programada** y "Crear curso"
    desaparece de ella;
  - la ficha del curso muestra "Plan anual · Presupuestos de obra pública".
- [ ] **5. Un curso por línea.** Abrir otra vez `/dashboard/cursos/nuevo?linea=<la
  misma>` a mano responde **409** "La línea ya tiene un curso vigente…".
- [ ] **6. Cancelar el curso libera la línea.** Cancelar ese borrador desde
  `/dashboard/cursos`: la línea vuelve a **Pendiente**, la columna Curso dice
  "1 cancelado(s)" y "Crear curso" vuelve a estar disponible.
- [ ] **7. Realizada sin tocarla (§9, paso 10).** Como `carlos.sop` en Impartición,
  capturar el resultado pendiente de `miguel.sop` en "Seguridad en obra" y
  finalizar: en el plan 2026 la línea pasa a **Realizada** y el avance a
  "2 de 3 realizadas (67 %)".
- [ ] **8. Reglas de la línea.**
  - Una línea con curso vigente no ofrece "Cancelar línea".
  - Presupuestos, que tuvo un curso cancelado, no ofrece "Borrar".
  - Una línea sin cursos se borra.
  - Topografía ofrece "Reactivar" y vuelve a Pendiente.
- [ ] **9. Solo lectura.** El plan 2025 muestra el aviso de ejercicio anterior y
  ninguna acción ni "Nueva línea".
- [ ] **10. Superadministrador.** Como `super@`: ve los planes con el filtro de
  dependencia y **sin** "Crear plan" ni acciones sobre líneas.
- [ ] **11. Aislamiento y guards.**
  - `laura.sds` no ve los planes de SOP. Abrir por URL el `documentId` del plan
    2026 de SOP responde **404**.
  - `diana.sop` en `/dashboard/plan-anual` recibe **403**, y el menú no muestra
    "Plan anual".

## PRD-08 · Notificaciones por correo

**Resembrar antes de empezar.** Preparación:

```bash
docker compose up -d mailpit
# en .env
SMTP_HOST=localhost
SMTP_PORT=1025
MAIL_FROM="Instituto Digital de Capacitación <no-responder@instituto.gob.mx>"
APP_BASE_URL=http://localhost:5173
```

Reiniciar `bun run dev` y abrir la bandeja en `http://localhost:8025`. Los correos
llegan en unos 15 segundos. La cola se consulta con `bunx prisma studio`
(`EmailOutbox`).

Verificación automática:

- `bun run test app/modules/notifications app/shared/mail app/core`.
- `bun run test app/modules/courses app/modules/enrollments app/modules/users app/modules/trainers`.
- El schema cambió: `bunx prisma db push` y `bunx prisma generate`.

- [ ] **1. Alta de cuenta.** Como `laura.sop`, dar de alta un usuario: llega "Tu
  cuenta en Instituto Digital de Capacitación" con enlace a iniciar sesión y
  **sin ninguna contraseña**. Lo mismo al registrar un capacitador externo desde
  el catálogo.
- [ ] **2. Restablecer contraseña.** Desde la ficha del usuario: llega "Tu
  contraseña fue restablecida", sin la contraseña.
- [ ] **3. Invitación a un grupo.** `laura.sop` crea y publica un curso de SOP con
  cupo y una sesión futura, e invita al grupo "Mandos medios": llega un correo por
  miembro con las sesiones en hora de Tijuana. Repetir la invitación no manda nada a quien ya estaba invitado.
- [ ] **4. Inscripción y asignación.** `miguel.sop` acepta la invitación → "Inscripción
  confirmada". `laura.sop` asigna a `diana.sop` a otro curso → "Te asignaron al
  curso".
- [ ] **5. Sin cupo, sin correo.** En "Redacción de oficios" (lleno), un intento de
  inscripción falla y **no** llega nada: el aviso se revirtió con la
  transacción.
- [ ] **6. Cambio de sede.** En un curso publicado con inscritos e invitados,
  cambiar la sede de una sesión → "Cambios en el curso" a los dos. Cambiar solo la
  descripción → nada.
- [ ] **7. Cancelación.** Cancelar ese curso → "Curso cancelado" a inscritos e
  invitados. Cancelar un borrador → nada.
- [ ] **8. Traslado de dependencia.** `laura.sop` mueve a `diana.sop` a SEDESOL desde
  Usuarios → "Cambiaste de dependencia", con origen y destino. Si
  `miguel.sop` se cambia solo desde Perfil, no llega nada.
- [ ] **9. El SMTP caído no bloquea.** `docker compose stop mailpit` y repetir el paso 4:
  la operación responde normal. En `EmailOutbox` el mensaje queda `PENDING` con
  `attempts` en aumento y `last_error`. `docker compose start mailpit`: sale solo
  en el siguiente reintento.
- [ ] **10. Sin SMTP.** Quitar `SMTP_HOST` y reiniciar: las operaciones siguen
  funcionando y el log registra "email not sent: SMTP is not configured" con
  destinatario y asunto, sin el cuerpo.

## MVP-02 · F-01 · Formato autogestivo y regla de completado

**Resembrar antes de empezar.** Supone que hoy es septiembre de 2026.

Verificación automática:

- `bun run test app/modules/courses app/modules/teaching app/modules/enrollments`.
- `bun run typecheck`.
- El schema cambió: `bunx prisma db push` y `bunx prisma generate` antes de sembrar.
  Añade `courses.format` y `courses.completion_rule`, **las dos con default**, así que
  ningún curso anterior cambia de comportamiento.

Lo que este recorrido tiene que dejar demostrado: que un curso sin sesiones se
publica, se inscribe, se cierra y otorga su crédito — y que un curso
calendarizado se comporta **exactamente** igual que antes. La decisión está en
[ADR 0011](docs/adr/0011-formato-de-curso-y-regla-de-completado.md).

- [ ] **1. El autogestivo de la semilla.** Como `laura.sds` en `/dashboard/cursos`:
  "Marco normativo municipal en línea" lleva el distintivo **Autogestivo** junto al
  de modalidad, tanto en cuadrícula como en lista. Los demás cursos **no** llevan
  ningún distintivo de formato: "Calendarizado" no se pinta.
- [ ] **2. Su ficha.** Al abrirlo: los distintivos son Publicado · En línea ·
  Autogestivo · Público. En **Detalles** aparece "Se completa con · Evaluación" y
  **no** aparecen "Asistencia mínima" ni "QR de asistencia".
- [ ] **3. Crear uno desde el wizard (paso Programa).** Como `laura.sop` en
  `/dashboard/cursos/nuevo`, llegar al paso 2:
  - Hay un selector **Formato** antes de Modalidad.
  - Al elegir "Autogestivo" desaparecen Modalidad y el gestor de sesiones —no se
    deshabilitan— y queda la línea "Sin sesiones que programar. Quien se inscriba
    recorre el curso a su ritmo…".
  - Volver a "Calendarizado" los devuelve con las sesiones que hubiera capturado.
- [ ] **4. Paso Reglas.** Con el formato en Autogestivo:
  - "Se completa con" queda en **Evaluación** y es la única opción.
  - "Requiere evaluación" aparece **marcada y deshabilitada**, con la explicación
    "Obligatoria con esta regla: es lo que decide quién completó".
  - **No** aparecen "Asistencia mínima" ni la ventana del QR.
  - En un curso calendarizado, "Se completa con" ofrece las dos opciones y elegir
    "Evaluación" esconde la asistencia mínima y fuerza la evaluación igual.
- [ ] **5. Paso Revisión.** El bloque Programa lleva el distintivo Autogestivo en
  lugar del de modalidad y dice "Sin sesiones: quien se inscribe recorre el curso a
  su ritmo". El bloque Reglas abre con "Se completa con · Evaluación" y no enseña
  asistencia mínima ni ventana del QR.
- [ ] **6. Publicar sin una sola sesión (§9, paso 4 del ADR).** El checklist de
  publicación pide **solo** "Un capacitador activo" (y la audiencia si es
  restringido): **no** aparecen "Al menos una sesión" ni la sede. No están marcados
  como cumplidos — están **omitidos**. Asignar un capacitador y publicar funciona.
- [ ] **7. Regresión del checklist.** Crear otro curso **calendarizado** y dejarlo sin
  sesiones: el checklist sí pide "Al menos una sesión", y publicar falla con "Para
  publicar, el curso necesita al menos una sesión."
- [ ] **8. El formato se congela al publicar.** Editar el autogestivo ya publicado y
  cambiar su formato a Calendarizado → falla con "El formato solo se puede cambiar
  mientras el curso es borrador." y el campo Formato queda marcado. El selector
  **no** está deshabilitado: la defensa es del servidor, que es la que cuenta.
  Cambiarlo en un borrador sí funciona.
- [ ] **9. Inscribirse.** Como `miguel.sds` en `/dashboard/cursos-disponibles`:
  - "Marco normativo municipal en línea" aparece en el catálogo **sin fecha de
    cierre**: mientras siga publicado, la inscripción no cierra.
  - Al inscribirse, el curso cae en `/dashboard/mis-cursos` → **En curso**, no en
    Próximos: no hay nada que esperar.
  - La baja sigue disponible, aunque no haya fecha de inicio que la limite.
- [ ] **10. Impartir.** Como `diana.sds` en `/dashboard/imparticion`, abrir el curso:
  - La cabecera dice "Se completa al aprobar la evaluación" y lleva el distintivo
    Autogestivo, **sin** el de modalidad.
  - **No** hay pestaña de Asistencia ni de Código QR, y la ficha abre en
    **Completado**.
  - En Completado, cada persona sale sin porcentaje de asistencia.
  - "Finalizar" está deshabilitado con "Falta capturar el resultado de 1
    persona(s).": el bloqueo por resultados pendientes sigue aplicando igual.
- [ ] **11. Cerrar el mismo día (§2.8 del ADR).** En Resultados, poner a
  `miguel.sds` "Aprobado" y finalizar: **no hay que esperar a ninguna fecha** —un
  calendarizado no dejaría hasta el día de su última sesión— y responde "Curso
  finalizado: 1 persona completó y se otorgó 1 crédito."
- [ ] **12. El ejercicio sale de la fecha de cierre.** Como `miguel.sds` en
  `/dashboard/mis-creditos`: el crédito está en el ejercicio del **año en que se
  cerró**, no en el de ninguna sesión. En `bunx prisma studio`,
  `credits.fiscal_year` lo confirma.
- [ ] **13. Fuera del calendario.** Como `miguel.sds` en `/dashboard/calendario`: el
  autogestivo no pinta ningún chip y no deja huecos ni filas vacías. Hoy sale gratis
  porque no tiene sesiones; F-12 lo confirmará como decisión.
- [ ] **14. Regresión del curso calendarizado.** "Seguridad en obra" (PRD-06) se
  comporta **exactamente** igual que antes:
  - Finalizar bloqueado por el resultado pendiente de `miguel.sop`.
  - La ventana de cierre abre el día de la última sesión, no antes.
  - El crédito de `diana.sop` toma el ejercicio de esa sesión.
  - La corrección posterior sigue retirando y restaurando el crédito sin crear
    filas nuevas.
  - Su checklist de publicación y sus errores de sede y enlace no cambiaron.
