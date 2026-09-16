# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de un Ayuntamiento de Baja California, organizado por dependencias. Los roles se acumulan en una misma persona:

- **Superadministrador** (pocos): da de alta dependencias, designa titulares, consulta todo y edita el tema de la plataforma.
- **Titular y auxiliar de dependencia**: operan el espacio de su dependencia (personal, grupos, cursos, plan anual, créditos del personal). Trabajan desde PC de oficina, en sesiones administrativas largas.
- **Capacitador** (interno o externo): crea e imparte cursos, pasa lista, captura resultados y finaliza.
- **Participante** (rol base de todo interno): consulta cursos disponibles, responde invitaciones, se inscribe, revisa su calendario, sus créditos y valora cursos. Entra con frecuencia desde el celular.

## Product Purpose

Plataforma institucional para organizar e impartir capacitación. Cada dependencia opera su propio espacio y puede abrir sus cursos a otras. El éxito del MVP es recorrer el ciclo completo de un curso sin tocar la base de datos a mano:

> planear → crear → abrir inscripción → impartir → pasar lista → evaluar → otorgar crédito → recibir valoración


## Positioning

No es un LMS: no aloja contenido (las sesiones en línea usan enlaces externos). Es la capa administrativa de la capacitación institucional: quién puede ver cada curso por dependencia, grupo o invitación, asistencia, crédito automático (1 curso completado = 1 crédito) que conserva la dependencia donde se obtuvo, y un plan anual que se marca como realizado solo.

## Operating Context

- Administración (titulares, auxiliares, superadmin) en escritorio; participantes mayormente en móvil. Ambos contextos son de primera clase.
- Sin autoregistro público: las cuentas las da de alta un administrador con contraseña temporal. No hay recuperación de contraseña de autoservicio en el MVP.
- La página pública `/` es solo puerta de acceso: identifica la plataforma y lleva al inicio de sesión. No promociona ni muestra catálogo.
- El inicio de sesión debe poder recibir después un segundo botón (Llave BC, autenticador institucional) sin reformar la pantalla.
- Calendario mensual con vista de lista; quien acumula roles ve juntos, y diferenciados, lo que cursa, lo que imparte y lo que organiza.

## Capabilities and Constraints

- Módulos del MVP: acceso y cuentas, dependencias y equipo, catálogo de capacitadores, grupos, cursos y sesiones, inscripción e invitaciones, calendario, impartición (asistencia, resultados, cierre), créditos, valoración, plan anual, notificaciones mínimas por correo.
- Modalidades: presencial (sede), en línea (enlace), híbrida (ambos). Acceso: público, restringido (dependencias o grupos), por invitación.
- Estados de curso: borrador → publicado → finalizado; cancelado desde borrador o publicado. No se borra: se desactiva o cambia de estado.
- Fuera del MVP: constancias PDF, tableros y gráficas, reportes exportables, validación de traslapes, contenido alojado.
- Tema de la plataforma editable por el superadmin (theme builder con borrador y publicado); modo claro/oscuro/sistema elegido por cada persona. Tipografías auto-hospedadas, sin peticiones a terceros en runtime.
- Stack existente: React Router (SSR), Tailwind, shadcn/ui, Prisma, Bun.
- Terminología fija: dependencia, titular, auxiliar, capacitador, participante, curso, sesión, grupo, inscripción, invitación, crédito, valoración, plan anual, ejercicio.

## Brand Commitments

- Identidad institucional del Ayuntamiento con manual de identidad obligatorio. **El manual (PDF) no entra al repositorio ni se usa como consulta.** El usuario aportará en `public/` los assets necesarios y un CSS de otro proyecto que ya aplica esa identidad; esa será la fuente de colores, tipografía y logotipos. Pendiente: hasta que lleguen, no se inventan logotipo, colores ni escudo institucionales.
- Voz en español, cercana, con trato de **tú**.

## Evidence on Hand

- Alcance MVP v1.1 y ADR 0001–0005 en `docs/adr/`.
- No hay testimonios, cifras de uso, logotipos ni fotografía institucional en el repositorio. No se fabrican.

## Product Principles

1. **La dependencia separa la operación.** Cada persona ve y hace exactamente lo que su rol y su dependencia permiten; lo que no puede ver no existe para ella, ni por listado ni por URL.
2. **El sistema calcula, la persona no captura dos veces.** Créditos, estados del plan y promedios se derivan solos.
3. **Nada se pierde.** Desactivar, cancelar o cambiar de dependencia conserva el historial.
4. **Recorte deliberado.** Lo que no sirve al ciclo completo del curso no entra al MVP.
5. **Institucional pero cercano.** Trato de tú, claridad sobre ceremonia.

## Accessibility & Inclusion

WCAG 2.1 AA como mínimo, en claro y oscuro, y en cualquier tema publicado por el superadmin (el theme builder ya incluye un panel de contraste). Uso táctil en móvil para participantes.
