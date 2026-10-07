# ADR 0034 · El panel de inicio compone los servicios de cada módulo

**Estado:** aceptado · 2026-10-07

## 1. Contexto

`/dashboard` era la primera pantalla tras iniciar sesión y no decía nada: un
saludo con el correo y, para el superadministrador, un enlace a Usuarios. Lo que
cada persona necesita ver al entrar está repartido en casi todos los módulos:
sus sesiones (calendario), sus cursos (inscripciones), lo que imparte
(impartición), lo que organiza (cursos, inscripciones, plan anual) y, para la
plataforma, dependencias, sesiones y la entrega de fondo.

El alcance del MVP descartó «tableros, gráficas y comparativos». El panel no los
reabre: es una lista de trabajo, con cifras dentro de frases y barras de avance.

## 2. Decisión

1. **El loader compone; no hay `dashboardService`.** `load-dashboard.server.ts`
   toma cada servicio del `context` y los llama en un solo `Promise.all`, como el
   asistente de cursos. Un servicio de panel que llamara a otros servicios
   desenvolvería `AppResponse` dentro de `AppResponse`; uno que leyera los
   repositorios de otros módulos copiaría su alcance, y CLAUDE.md lo prohíbe.
2. **Cada lectura nueva vive en el módulo dueño de su tabla**, detrás de su
   puerto: `calendarService.listWeek`, `enrollmentSummaryService`,
   `teachingService.summarizePending`, `courseAttentionService`,
   `annualPlanService.summarizeCurrent` y `summarizeCoverage`,
   `dependencyService.listWithoutHead`, `sessionMonitorService.countActive`,
   `creditService.summarizeYear` y `operationsService.summarizeHealth`.
3. **Facetas, no roles.** `resolveDashboardFacets` calcula si la persona cursa,
   imparte, organiza, escribe plan o administra la plataforma. Los roles se
   acumulan (§3), así que un titular capacitador ve las cuatro primeras. Cada
   faceta pregunta con el mismo predicado que el guard del servicio que llama:
   un FORBIDDEN en el panel es un error de verdad, y el loader corta con el
   status del diccionario del módulo, sin degradar por faceta.
4. **El módulo `dashboard` no tiene `application/` ni `infrastructure/`**: tipos,
   límites y reglas puras en `domain/`, el predicado de revalidación en `utils/`
   y la composición en `routes/`, igual que `cloud/`.
5. **Operación tiene pantalla propia.** El aviso de correos o trabajos fallidos
   lleva a `/dashboard/operacion` (módulo `operations`, solo lectura), para que el
   número del panel se pueda atender. Reintentar y reencolar quedan fuera.

## 3. Consecuencias

- El costo es el de la persona, no el de la plataforma: entre 3 y 13 consultas,
  todas en una fase (88–175 ms medidos contra Neon con `DEBUG_QUERY_COUNT`).
- Agregar algo al panel es agregar un método al puerto del módulo dueño, con su
  prueba, y una entrada en el `Promise.all`.
- La dependencia de acogida «Sin asignar» (`UNASSIGNED_DEPENDENCY`) no se cuenta
  como dependencia sin titular ni sin plan.
- Cambiar el modo claro u oscuro no vuelve a leer el panel
  (`shouldRevalidateDashboard`).
