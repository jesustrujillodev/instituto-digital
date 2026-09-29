# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de un Ayuntamiento de Baja California, organizado por dependencias. Los roles se acumulan en una misma persona:

- **Superadministrador** (pocos): da de alta dependencias, designa titulares y consulta todo.
- **Titular y auxiliar de dependencia**: operan el espacio de su dependencia (personal, grupos, cursos, plan anual, créditos del personal). Trabajan desde PC de oficina, en sesiones administrativas largas.
- **Capacitador** (interno o externo): crea e imparte cursos, arma su temario, pasa lista, captura resultados y finaliza.
- **Participante** (rol base de todo interno): consulta cursos disponibles, responde invitaciones, se inscribe, cursa en el aula, revisa su calendario, sus créditos y certificados, y valora cursos. Entra con frecuencia desde el celular.

## Product Purpose

LMS institucional del Ayuntamiento: organiza, entrega y acredita la capacitación del personal. Cada dependencia opera su propio espacio y puede abrir sus cursos a otras. El éxito es recorrer el ciclo completo de un curso sin tocar la base de datos a mano:

> planear → crear → abrir inscripción → impartir o cursar en el aula → pasar lista → evaluar → otorgar crédito y certificado → recibir valoración


## Positioning

Un LMS hecho para la estructura de un Ayuntamiento, no un LMS genérico: aloja y entrega el contenido (temario, lecciones, cuestionarios, material de sesiones) y evalúa y certifica, pero sobre la operación administrativa por dependencia. Quién puede ver cada curso se decide por dependencia, grupo o invitación; la asistencia se registra con QR y el crédito es automático (1 curso completado = 1 crédito, que conserva la dependencia donde se obtuvo); el certificado se verifica en público; y el plan anual se marca como realizado solo.

## Operating Context

- Administración (titulares, auxiliares, superadmin) en escritorio; participantes mayormente en móvil. Ambos contextos son de primera clase.
- Sin autoregistro público: las cuentas las da de alta un administrador con contraseña temporal. No hay recuperación de contraseña de autoservicio en el MVP.
- La página pública `/` es solo puerta de acceso: identifica la plataforma y lleva al inicio de sesión. No promociona ni muestra catálogo.
- El inicio de sesión debe poder recibir después un segundo botón (Llave BC, autenticador institucional) sin reformar la pantalla.
- Calendario mensual con vista de lista; quien acumula roles ve juntos, y diferenciados, lo que cursa, lo que imparte y lo que organiza.

## Capabilities and Constraints

- Módulos: acceso y cuentas, dependencias y equipo, capacitadores (dentro de Usuarios), grupos, cursos y sesiones, aula (temario, lecciones, cuestionarios con intentos y calificación mínima, material de sesiones), inscripción e invitaciones, calendario, impartición (asistencia por QR, resultados, cierre), créditos, certificados (diseño por curso, PDF, verificación pública), valoración, plan anual, notificaciones por correo, gestor de archivos en la nube.
- Modalidades: presencial (sede), en línea (enlace), híbrida (cada sesión en sede o en línea). Formato: calendarizado (lo marcan las sesiones) o autogestivo (a su ritmo, completa por contenido; si es híbrido admite sesiones opcionales). Acceso: público, restringido (dependencias o grupos), por invitación.
- Estados de curso: borrador → publicado → finalizado; cancelado desde borrador o publicado. No se borra: se desactiva o cambia de estado.
- Fuera del alcance actual: reportes administrativos exportables (solo existe el Excel personal de «Mis cursos») y validación de traslapes de sesiones.
- Un solo tema institucional, fijo (no se personaliza desde la aplicación); modo claro/oscuro/sistema elegido por cada persona. Tipografías auto-hospedadas, sin peticiones a terceros en runtime.
- Stack existente: React Router (SSR), Tailwind, shadcn/ui, Prisma, Bun.
- Terminología fija: dependencia, titular, auxiliar, capacitador, participante, curso, sesión, grupo, inscripción, invitación, crédito, valoración, plan anual, ejercicio.

## Brand Commitments

- Identidad institucional del Ayuntamiento con manual de identidad obligatorio. **El manual (PDF) no entra al repositorio ni se usa como consulta.** La fuente de verdad son los assets de `public/`: el logotipo blanco del Ayuntamiento (`public/assets/aytoBco.png`), el favicon con el escudo, la tipografía ITC Avant Garde (`public/font/`) y `public/layout.css`, la hoja de otro proyecto que ya aplica la identidad. Lo que no esté ahí no se inventa.
- Voz en español, cercana, con trato de **tú**.

## Evidence on Hand

- Alcance MVP v1.1 y ADR 0001–0026 en `docs/adr/`.
- Assets de identidad en `public/` (ver Brand Commitments).
- No hay testimonios, cifras de uso ni fotografía institucional en el repositorio. No se fabrican.

## Product Principles

1. **La dependencia separa la operación.** Cada persona ve y hace exactamente lo que su rol y su dependencia permiten; lo que no puede ver no existe para ella, ni por listado ni por URL.
2. **El sistema calcula, la persona no captura dos veces.** Créditos, estados del plan y promedios se derivan solos.
3. **Nada se pierde.** Desactivar, cancelar o cambiar de dependencia conserva el historial.
4. **Recorte deliberado.** Lo que no sirve al ciclo completo del curso no entra.
5. **Institucional pero cercano.** Trato de tú, claridad sobre ceremonia.

## Accessibility & Inclusion

WCAG 2.1 AA como mínimo, en claro y oscuro. Uso táctil en móvil para participantes.
