# Sistema de capacitación — análisis de brechas contra la plantilla

**Estado:** análisis · 2026-09-14 — pendiente de respuestas a §6 antes de convertirlo en plan de implementación.
**Origen:** `Sistema de capacitación..md` (requerimiento inicial) contra la plantilla en `dev` (`8954690`).

## 1. Veredicto

La plantilla cubre la **base transversal** (auth, sesiones, usuarios, RBAC plano, storage,
tablas/listados, formularios, temas, arquitectura hexagonal + DI + contrato de respuestas).
**Ninguna función de negocio del requerimiento existe hoy.** Además faltan cinco capacidades
de infraestructura que el requerimiento da por hechas: correo, tareas programadas, PDF,
QR y gráficas.

Lo específico de concesionaria (`inventory`, `showroom`, sitemap/robots, variables
`PUBLIC_*` de contacto, enums de vehículo en `prisma/schema.prisma`) no aporta nada al
dominio y habría que retirarlo del proyecto derivado.

## 2. Qué se reutiliza tal cual

| Pieza | Dónde | Uso en capacitación |
|---|---|---|
| Autenticación doble token, sesiones, revocación, lockdown | `app/modules/auth/` | Acceso de todos los roles |
| Contrato `AppResponse`, `createOperationRunner`, `DomainError` | `app/shared/response/`, `app/shared/errors/` | Todos los módulos nuevos |
| DI por petición (Awilix) | `app/shared/di/` | Todos los módulos nuevos |
| Query builder + `DataTable` + filtros en URL | `app/shared/query/`, `app/shared/components/common/data-table.tsx` | Listados de temas, expositores, SP, asistencias |
| Storage S3/GCS con bucket privado/público | `app/shared/storage/` | Banco de firmas (privado), diplomas PDF |
| Formularios RHF + valibot, inputs comunes | `app/shared/components/common/`, `docs/guia-formularios-react-router-rhf.md` | Catálogos, DNC, PAC |
| Theme builder + modo oscuro | `app/modules/theme/` | Identidad institucional del Ayuntamiento |
| Layout dashboard, sidebar por rol, breadcrumb | `app/shared/layout/` | Navegación por rol |

## 3. Qué hay que adaptar

| Pieza | Hoy | Necesario |
|---|---|---|
| Roles | `ROLES = ["USER", "ADMIN"]` (`app/shared/rules/atoms.rules.ts:34`), un rol por usuario | `CAPACITACION`, `DEPENDENCIA`, `TITULAR_AREA`, `SERVIDOR_PUBLICO` (+ ¿admin de sistema?) |
| Autorización | `requireRole` solo decide por rol (`app/shared/auth/require-role.server.ts`) | **Autorización con alcance**: el titular ve solo su área, la dependencia solo la suya. Hoy no existe ningún filtro por pertenencia |
| Usuario | `email, firstName, lastName, phone, role, photoUrl` (`prisma/schema.prisma:16`) | Número de empleado, puesto, adscripción (dependencia/área) con historial |
| Alta de usuarios | Una a una por ADMIN, email + contraseña | Alta masiva (padrón de RH) — ver §6 |
| Dashboard home | Tarjeta "Gestionar usuarios" (`app/modules/dashboard/routes/home/index.tsx`) | Tablero distinto por rol (módulo 2) |
| `PRODUCT.md`, navegación, seeds | Concesionaria | Capacitación |

## 4. Capacidades transversales nuevas (no existen)

| Capacidad | Lo exige | Nota |
|---|---|---|
| **Correo transaccional** (puerto + adaptador SMTP/proveedor) | Flujo 1, 2; SP "recibir notificaciones por correo" | Sin dependencia de correo en `package.json` |
| **Tareas programadas / cola** | Plazo máximo del DNC, recordatorios, "al habilitarse un mes se refleja", envío masivo de correos | Hoy no hay jobs; `single-flight` no lo cubre |
| **Generación de PDF** | Diplomas con firmas | Plantilla + folio |
| **QR** | Flujo 10 | Generar por sesión y validar al escanear |
| **Gráficas** | Titular: gráficas de cumplimiento y créditos | No hay `chart` en `app/shared/components/ui/` |
| **Calendario (UI)** | Calendario de capacitaciones y del SP | No hay componente de calendario |
| **Motor de cuestionarios** | Cuestionario DNC **y** cuestionario de evaluación | Un solo motor (preguntas, tipos, respuestas, calificación) para ambos |
| **Bitácora de auditoría** | Validaciones DNC/PAC, observaciones, registro de asistencia | Hoy solo existe `lockdownBy` |

## 5. Matriz de cobertura del requerimiento

Estado: **R** reutiliza · **A** adapta · **N** nuevo. Módulo propuesto en `app/modules/<modulo>`.

### 5.1 Módulo 1 · Gestión de Capacitación

| Rol | Función | Módulo propuesto | Estado |
|---|---|---|---|
| Capacitación | Gestionar catálogo de capacitaciones | `topics` | N |
| Capacitación | Programar calendario de capacitaciones | `scheduling` | N (+ calendario UI) |
| Capacitación | Gestionar banco de firmas | `signatures` | N (storage R) |
| Capacitación | Gestionar generación de diplomas | `diplomas` | N (+ PDF) |
| Capacitación | Gestionar formulario DNC | `questionnaires` | N (+ motor) |
| Capacitación | Habilitar convocatoria DNC | `dnc` | N (+ correo, plazo) |
| Capacitación | Generar PAC | `pac` | N |
| Dependencia | Validar DNC | `dnc` | N (+ auditoría) |
| Dependencia | Validar PAC | `pac` | N (+ observaciones) |
| Titular de Área | Responder DNC | `dnc` | N |

### 5.2 Módulo 2 · Seguimiento

| Rol | Función | Módulo propuesto | Estado |
|---|---|---|---|
| SP | Visualizar su PAC | `tracking` | N |
| SP | Visualizar su % de cumplimiento | `tracking` | N |
| SP | Visualizar su asistencia | `tracking` | N |
| SP | Visualizar su calendario | `tracking` / `scheduling` | N (+ calendario UI) |
| SP | Recibir notificaciones por correo | `notifications` | N (+ correo) |
| SP | Visualizar sus créditos | `tracking` | N |
| SP | Visualizar diplomas obtenidos | `diplomas` | N (storage R) |
| Titular | PAC de su área | `tracking` | N (+ alcance) |
| Titular | % de cumplimiento de su área | `tracking` | N (+ alcance) |
| Titular | % de cumplimiento por capacitación | `tracking` | N (+ alcance) |
| Titular | Gráficas de cumplimiento | `tracking` | N (+ gráficas) |
| Titular | Gráficas de créditos | `tracking` | N (+ gráficas) |
| Titular | Datos de SP de su área | `tracking` | N (DataTable R) |
| Capacitación | Datos de todos los SP | `tracking` | N (DataTable R) |

### 5.3 Catálogos y registros

| Catálogo | Campo | Estado |
|---|---|---|
| 3.1 Temas | Nombre, área temática, descripción/objetivo, duración, modalidad, créditos, vigencia | N — área temática como catálogo, modalidad como enum |
| 3.2 Expositores | Nombre, institución (interno/externo), especialidad (↔ temas), contacto | N |
| 3.2 Expositores | Firma digital (↔ banco de firmas) | N — depende de §6 P7 |
| 3.2 Expositores | Historial de capacitaciones impartidas | N — derivado de `scheduling` + asistencias, no capturado |
| 3.3 Registro SP | Datos generales (nombre, núm. empleado, puesto) | A — `User` + perfil |
| 3.3 Registro SP | Dependencia / área | N — `organization` |
| 3.3 Registro SP | PAC asignado, historial asistencias, créditos, diplomas, % cumplimiento | N — vista derivada, no tabla propia |

### 5.4 Flujo general

| # | Paso | Módulo | Pieza nueva que exige |
|---|---|---|---|
| 1 | Habilita catálogo + convocatoria, notifica con plazo | `dnc`, `notifications` | Correo, job de vencimiento |
| 2 | Dependencia da seguimiento a titulares | `dnc` | Tablero de avance por área, recordatorio |
| 3 | Titular elige temas, responde cuestionario, pide temas específicos, designa personal | `dnc`, `questionnaires` | Motor de cuestionarios |
| 4 | Dependencia valida y libera | `dnc` | Estados + auditoría (¿rechazo? §6 P9) |
| 5 | Capacitación programa y estructura PAC | `pac` | Consolidado de DNC por dependencia |
| 6a/6b | Dependencia observa o valida PAC | `pac` | Ciclo de observaciones versionado |
| 7 | Logística y calendario mensual; al habilitar el mes se refleja al SP | `scheduling` | Habilitación por mes, calendario UI |
| 8 | Pide cuestionario de evaluación y firmas a capacitadores | `questionnaires`, `signatures` | ¿Acceso del capacitador? §6 P6 |
| 9 | SP consulta PAC y calendario | `tracking` | — |
| 10 | SP valida asistencia con QR del cuestionario | `attendance` | QR, ventana de tiempo, antifraude |
| 11 | Sistema registra asistencia y créditos según resultado | `attendance` | Reglas de calificación → asistencia/créditos |
| 12 | Seguimiento por jerarquía, estadísticas y gráficas | `tracking` | Gráficas, alcance |

Máquinas de estado mínimas: **Convocatoria DNC** (borrador → abierta → cerrada),
**Respuesta DNC por área** (pendiente → enviada → validada / devuelta),
**PAC por dependencia** (borrador → en revisión → con observaciones → validado),
**Mes de calendario** (borrador → habilitado), **Sesión** (programada → en curso → cerrada).

## 6. Preguntas abiertas

Ver la conversación del 2026-09-14; se registrarán aquí las respuestas.

| # | Pregunta | Propuesta por defecto |
|---|---|---|
| P1 | ¿Proyecto nuevo derivado de la plantilla (retirando inventario/catálogo) o módulos dentro de este repo? | Repo derivado |
| P2 | ¿Cómo acceden los SP: correo institucional + contraseña, número de empleado, SSO/Directorio Activo? ¿Cuántos SP? ¿Alta desde un Excel de RH? | Núm. empleado o correo, importación Excel |
| P3 | ¿Un usuario puede tener varios roles (el titular también es SP con PAC propio)? ¿Jerarquía solo Dependencia → Área? ¿"Dependencia" es una persona enlace por dependencia? | Roles múltiples; 2 niveles; enlace por dependencia |
| P4 | ¿El cuestionario de evaluación vive en la plataforma? ¿Reprobar = sin asistencia, o asistencia sí y créditos no? ¿Intentos, calificación mínima? | Interno; asistencia al responder, créditos al aprobar |
| P5 | ¿Antifraude del QR: sesión iniciada obligatoria, ventana de horario, un registro por SP? ¿Cómo registra asistencia la modalidad virtual? | Login + ventana horaria + único por SP |
| P6 | ¿Los capacitadores entran al sistema (subir cuestionario y firma) o Capacitación captura por ellos? | Captura Capacitación |
| P7 | ¿Firma "digital" = imagen escaneada o firma electrónica avanzada (e.firma)? ¿Folio y QR de verificación pública en el diploma? ¿Quién firma? | Imagen + folio verificable |
| P8 | ¿% de cumplimiento = cursos aprobados / cursos asignados, o créditos / meta anual? ¿Qué pasa si el SP cambia de área a mitad del ejercicio? | Cursos aprobados / asignados; el PAC sigue al SP |
| P9 | Paso 4: si la Dependencia **no** considera coherente el DNC, ¿se devuelve al titular con observaciones como el PAC? | Sí, mismo ciclo que PAC |
| P10 | ¿Cupo por sesión, sedes/aulas como catálogo, grupos de un mismo tema? | Cupo + sede como catálogo |
| P11 | ¿Proveedor de correo e infraestructura (on-prem del Ayuntamiento, nube)? ¿Restricciones de datos personales / retención? | SMTP institucional |
| P12 | ¿Reportes exportables (Excel/PDF) para Capacitación? No están en el documento | Sí, Excel de SP y asistencias |
