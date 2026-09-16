# Verificación manual · PRD-01 a PRD-05

Recorridos que confirman que cada PRD está entregado. Salen de la sección de
verificación de cada plan.

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
- [ ] **8. Asignación.** `laura.sop` abre "Atención ciudadana" (de SEDESOL, pública):
  el buscador de "Asignar personal" solo ofrece personal de SOP. Asigna a
  `carlos.sop`, que lo ve en Mis cursos como inscrito por asignación.
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
