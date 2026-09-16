# **Instituto Digital de Capacitación**

## **Notas de alcance**

El objetivo de la plataforma es la **gestión de cursos para las personas servidoras públicas del Ayuntamiento**: planear el material del año, programarlo, convocar, registrar asistencia, acreditar y dar seguimiento.

> * **El DNC queda completamente fuera.** Es un intercambio de oficios y documentos entre dependencias para justificar por qué, cuándo y cómo se dará un curso. No se captura, no se modela y no se referencia en la plataforma.  
> * **El PAC no tiene flujos de validación.** Cuando el usuario maestro lo registra, ya viene validado por un proceso que ocurre íntegramente fuera del sistema. Ningún rol aprueba, rechaza ni observa el PAC dentro de la plataforma.  
> * **El término PAC se usa en dos sentidos y se modelan por separado.** El *PAC institucional* es el plan anual de material que administra el usuario maestro (M3). El *PAC asignado* es el conjunto de capacitaciones en que cada servidor público está inscrito en el ejercicio (M4), y es la base del cálculo de su porcentaje de cumplimiento.  
> * **Banco de firmas fuera de esta fase.** Se sustituye por folio único y código QR de verificación en cada documento emitido.  
> * **Los capacitadores no tienen catálogo propio.** Son usuarios de la misma tabla, diferenciados por rol, con atributos adicionales de perfil (M1).

## 

## **M1 · Personas servidoras públicas, plantilla y perfiles**

**Objetivo.** Mantener la base institucional de personas servidoras públicas sincronizada con la plantilla de personal, con usuario individual para cada una, y con los atributos adicionales que requiere el perfil de capacitador.  
**Actores.** Capacitación (administra), Sistema (concilia), Servidor Público (accede a su cuenta).

### **Entidad · Servidor Público**

| Campo | Regla |
| :---- | :---- |
| Número de empleado | Identificador único, obligatorio |
| Nombre completo | Obligatorio |
| CURP o RFC | Opcional, validado por formato |
| Correo institucional | Obligatorio; llave de vinculación con el usuario de plataforma |
| Puesto | Texto |
| Dependencia | Catálogo |
| Unidad administrativa | Catálogo, dependiente de la dependencia |
| Fecha de ingreso | Fecha |
| Estatus | Activo / baja |
| Fecha de último movimiento | Automático |

### 

### **Extensión de perfil · Capacitador**

Atributos adicionales sobre el registro de usuario cuando tiene rol Capacitador.

| Campo | Regla |
| :---- | :---- |
| Tipo | Interno (servidor público del Ayuntamiento) / externo |
| Institución o dependencia | Texto. Para internos se toma de su adscripción |
| Especialidad / temas que imparte | Relación múltiple con el Catálogo de Temas (M2) |
| Datos de contacto | Correo y teléfono |
| Historial de capacitaciones impartidas | Autoalimentado desde M4 y M6: fecha, tema, número de asistentes, porcentaje de aprobación |

El capacitador externo se da de alta como usuario sin registro en la plantilla de personal: tiene acceso, pero no expediente ni PAC asignado.

### **Funcionalidades**

> * Importación de la plantilla desde archivo estructurado (CSV/XLSX), con validación previa y reporte de filas aceptadas, rechazadas y motivo del rechazo.  
> * Conciliación incremental contra el padrón vigente: detecta altas, bajas y cambios de adscripción y presenta los cambios para confirmación antes de aplicarlos.  
> * Bitácora histórica de adscripciones por persona, de modo que el expediente conserve el área en que se cursó cada capacitación aunque la persona cambie de unidad.  
> * Asignación automática de usuario individual al incorporarse a la plantilla, vinculado por correo institucional o número de empleado.  
> * Alta y edición manual individual para casos excepcionales y para capacitadores externos.  
> * Administración de los catálogos de dependencias y unidades administrativas.

### **Reglas**

> * Una baja conserva el expediente completo pero retira el acceso a la plataforma.  
> * Un cambio de adscripción no modifica el historial de capacitaciones previas ni reasigna créditos ya obtenidos.  
> * Los registros no se eliminan físicamente; se marcan como inactivos.

### **Criterios de aceptación**

> * Una importación de la plantilla completa se procesa sin pérdida de registros.  
> * Toda persona activa en la plantilla tiene usuario individual con acceso a su información.  
> * Un usuario con rol Capacitador puede seleccionarse como expositor en M4 y su historial se alimenta sin captura manual.

## 

## **M2 · Catálogo de Temas de Capacitación**

**Objetivo.** Administrar el universo de temas que pueden planearse, programarse, cursarse y acreditarse.  
**Actores.** Capacitación (alta, edición, desactivación); el resto de roles sólo consulta.

### **Entidad · Tema**

| Campo | Regla |
| :---- | :---- |
| Nombre del tema | Obligatorio, único dentro del ejercicio |
| Área temática | Catálogo auxiliar administrable: legal, técnica, atención ciudadana, desarrollo humano, otras |
| Descripción y objetivo | Texto largo |
| Duración estimada | Horas o número de sesiones |
| Modalidad | Presencial / virtual / híbrida |
| Créditos otorgados | Numérico. Valor que se asigna al aprobar el cuestionario de evaluación en M6 |
| Vigencia | Fecha de inicio y fin de disponibilidad en el catálogo |
| Estatus | Activo / inactivo |

### **Funcionalidades**

> * Alta, edición, consulta y desactivación de temas.  
> * Administración del catálogo auxiliar de áreas temáticas.  
> * Búsqueda y filtro por nombre, área temática, modalidad y vigencia.  
> * Vista de capacitaciones disponibles para el servidor público: temas vigentes con sesiones programadas y abiertas a inscripción.

### **Reglas**

> * Un tema fuera de vigencia o inactivo no puede planearse ni programarse.  
> * Modificar los créditos de un tema no recalcula los créditos ya otorgados en sesiones pasadas.

### **Criterios de aceptación**

> * Un tema desactivado desaparece de las opciones de planeación y programación, pero sigue visible en los expedientes donde ya fue cursado, con los créditos que tenía al acreditarse.

## 

## **M3 · Plan Anual de Capacitación (PAC institucional)**

**Objetivo.** Permitir al usuario maestro registrar y controlar el material que impartirá a lo largo del ejercicio: qué temas, en qué periodo y dirigidos a quién. Es una herramienta de planeación y control propio, no un documento sujeto a aprobación.  
**Actores.** Capacitación y Capacitador (crean y administran su plan), Titular de Área y Servidor Público (consultan lo que les corresponde).

### **Entidad · Plan Anual**

| Campo | Regla |
| :---- | :---- |
| Ejercicio | Año. Un responsable puede tener un plan por ejercicio |
| Responsable | Usuario con rol Capacitación o Capacitador |
| Nombre / descripción | Texto libre |
| Estatus | Borrador / publicado. Publicado únicamente significa visible para consulta; no implica aprobación de nadie |

### **Entidad · Línea del Plan**

| Campo | Regla |
| :---- | :---- |
| Tema | Referencia al Catálogo de Temas (M2), sólo temas vigentes |
| Periodo previsto | Mes o trimestre del ejercicio |
| Número estimado de sesiones | Numérico |
| Modalidad prevista | Heredada del tema, editable |
| Público objetivo | Dependencias o unidades administrativas destinatarias, o abierto a todo el Ayuntamiento |
| Cupo estimado | Numérico |
| Observaciones | Texto libre, para notas del capacitador sobre el material |
| Estatus de la línea | Planeada / programada / impartida / cancelada. Se actualiza automáticamente conforme a M4 y M6 |

### **Funcionalidades**

> * Creación del plan anual por ejercicio y responsable.  
> * Duplicado del plan del ejercicio anterior como punto de partida, con ajuste de periodos.  
> * Alta de líneas seleccionando temas del catálogo, con captura de periodo, sesiones estimadas y público objetivo.  
> * Vista de línea de tiempo anual: distribución del material por mes, para detectar meses saturados o vacíos.  
> * Conversión de una línea del plan en sesiones programadas (pasa a M4), conservando la liga entre la línea y las sesiones generadas.  
> * Indicador de avance del propio plan: líneas programadas sobre planeadas, y líneas impartidas sobre planeadas.  
> * Exportación del plan anual a PDF y hoja de cálculo, para los oficios y trámites que ocurren fuera de la plataforma.

### **Reglas**

> * El plan no tiene estados de validación, aprobación ni observación. Ningún rol lo aprueba dentro de la plataforma.  
> * El plan es editable durante todo el ejercicio: agregar, mover o cancelar líneas no requiere autorización.  
> * Una línea que ya generó sesiones no puede eliminarse; sólo cancelarse, y la cancelación no afecta las sesiones ya impartidas ni los créditos otorgados.  
> * Programar una sesión sin línea de plan asociada es válido: el plan orienta, no restringe.  
> * Cerrado el ejercicio, el plan queda en consulta histórica y deja de ser editable.

### **Criterios de aceptación**

> * Un capacitador puede construir su plan anual completo sin que ningún otro rol intervenga.  
> * El estatus de cada línea refleja automáticamente lo ocurrido en programación e impartición, sin actualización manual.  
> * El plan exportado es utilizable como documento de trabajo fuera de la plataforma.

## 

## **M4 · Programación, Calendario, Convocatorias e Inscripción**

**Objetivo.** Convertir los temas planeados en sesiones concretas con fecha, sede, capacitador y cupo; inscribir o asignar participantes; y reflejar todo en el calendario individual de cada persona. El conjunto de sesiones en que participa una persona durante el ejercicio constituye su **PAC asignado**.  
**Actores.** Capacitación y Capacitador (programan), Servidor Público (consulta e inscribe), Titular de Área (consulta su área).

### **Entidad · Sesión**

| Campo | Regla |
| :---- | :---- |
| Tema | Referencia al Catálogo de Temas (M2), sólo temas vigentes |
| Línea del plan | Referencia opcional a M3 |
| Capacitador | Usuario con rol Capacitador (M1) |
| Fecha, hora de inicio y fin | Obligatorio |
| Modalidad | Heredada del tema, editable por sesión |
| Sede o liga de acceso | Según modalidad |
| Cupo máximo | Numérico |
| Tipo de inscripción | Asignada por Capacitación / abierta a inscripción |
| Periodo de inscripción | Fechas de apertura y cierre, cuando es abierta |
| Ejercicio | Año; agrupa el PAC asignado y los créditos |
| Estatus | Programada / en curso / cerrada / cancelada |

### **Entidad · Participante de sesión**

Sesión, servidor público, origen (asignado / inscripción propia), fecha de alta, estatus (activo / retirado).

### **Funcionalidades**

> * Programación de sesiones: fecha, horario, sede, capacitador, cupo y logística por curso o taller.  
> * Generación de sesiones a partir de una línea del plan anual, heredando tema, modalidad y público objetivo.  
> * Asignación de participantes por dependencia o unidad administrativa, con selección masiva desde la plantilla de personal.  
> * Generación y publicación de convocatorias por sesión, con texto, requisitos y periodo de inscripción.  
> * Inscripción por parte del servidor público en sesiones abiertas, sujeta a cupo disponible y a vigencia del tema.  
> * Habilitación del calendario por mes: al habilitarse un periodo, las sesiones se reflejan automáticamente en el calendario individual de cada participante.  
> * Vista de calendario mensual y de lista, diferenciada por rol: propia para el servidor público, del área para el Titular, institucional para Capacitación.  
> * Detalle de sesión para el participante: capacitador, tema, modalidad, horario y sede.  
> * Cancelación y reprogramación de sesiones, con notificación automática a los participantes (dispara M5).  
> * Cierre de sesión, que consolida la lista definitiva de participantes y habilita el procesamiento de M6.

### **Reglas**

> * No se permite traslape de horario para un mismo capacitador ni para un mismo participante.  
> * La inscripción se bloquea al alcanzarse el cupo máximo o al cerrarse el periodo de inscripción.  
> * Un servidor público sólo ve sesiones de periodos habilitados.  
> * Cancelar una sesión no elimina su registro histórico ni las asistencias ya validadas.  
> * Retirar a un participante que ya acreditó no revoca sus créditos ni su diploma.

### **Criterios de aceptación**

> * Al habilitar un mes, cada participante ve las sesiones correspondientes en su calendario sin acción adicional.  
> * El PAC asignado que una persona consulta en su portal corresponde exactamente a las sesiones en que figura como participante activo en el ejercicio.  
> * Una inscripción propia queda distinguible de una asignación institucional en los reportes.

***Punto abierto:*** **definir si la inscripción propia del servidor público requiere visto bueno del Titular de Área o es directa contra cupo.**

## 

## **M5 · Notificaciones automatizadas**

**Objetivo.** Comunicar por correo electrónico institucional los eventos relevantes del proceso, sin intervención manual.  
**Actores.** Sistema (emite), Capacitación (administra plantillas y consulta bitácora), Servidor Público y Capacitador (reciben).

### **Eventos que disparan notificación**

| Evento | Destinatario |
| :---- | :---- |
| Publicación de convocatoria de una capacitación abierta | Servidores públicos del universo convocado |
| Asignación a una capacitación | Servidor público asignado |
| Confirmación de inscripción | Servidor público inscrito |
| Habilitación del calendario mensual | Participantes con sesiones en el periodo |
| Recordatorio previo a la sesión | Participantes de la sesión |
| Cancelación o reprogramación de sesión | Participantes de la sesión |
| Solicitud de cuestionario de evaluación | Capacitador de la sesión |
| Diploma o constancia disponible para descarga | Servidor público acreditado |

### **Funcionalidades**

> * Plantillas de correo editables por Capacitación, con campos dinámicos: nombre, tema, capacitador, fecha, horario y sede.  
> * Envío en cola, con reintento automático ante fallo del servidor de correo.  
> * Bitácora de envíos: destinatario, evento, fecha, estatus (enviado / fallido) y opción de reenvío manual.  
> * Configuración de la antelación de los recordatorios previos a sesión.

### **Reglas**

> * El envío es asíncrono: un fallo del servidor de correo no bloquea ninguna operación del sistema.  
> * No se notifica a usuarios dados de baja.

### **Criterios de aceptación**

> * Todo evento de la tabla genera su correo y queda registrado en bitácora.  
> * Un mensaje fallido es identificable y reenviable sin repetir la operación que lo originó.

## **M6 · Cuestionario de Evaluación, Asistencia por QR y Créditos**

**Objetivo.** Validar asistencia y aprovechamiento en un solo acto y asignar créditos automáticamente.  
**Actores.** Capacitador (elabora el cuestionario), Servidor Público (lo responde), Sistema (valida y acredita), Capacitación (supervisa y ajusta).

### **Entidades**

| Entidad | Campos |
| :---- | :---- |
| Cuestionario de Evaluación | Sesión asociada, preguntas de opción múltiple con respuesta correcta, calificación mínima aprobatoria, intentos permitidos, ventana de aplicación |
| Registro de Asistencia | Sesión, servidor público, fecha y hora de registro, calificación obtenida, estatus (asistió y acreditó / asistió y no acreditó / no asistió), origen (QR / ajuste manual) |
| Registro de Créditos | Servidor público, sesión, tema, créditos otorgados, ejercicio, fecha de asignación |

### **Flujo operativo**

> 1. El capacitador captura el cuestionario de su sesión desde su acceso, o Capacitación lo captura en su nombre.  
> 2. El sistema genera un código QR único por sesión, vigente sólo durante la ventana definida.  
> 3. El servidor público escanea el QR, se identifica con su sesión de plataforma y responde el cuestionario.  
> 4. Al enviar, el sistema registra la asistencia y, si alcanza la calificación mínima, asigna automáticamente los créditos del tema y dispara la generación del diploma en M7.

### **Reglas**

> * El QR sólo opera dentro de su ventana de vigencia.  
> * Sólo puede responder quien figure como participante activo de la sesión.  
> * No se admite registro duplicado de la misma sesión por la misma persona.  
> * Los créditos se asignan una sola vez por sesión acreditada.  
> * Capacitación puede registrar o corregir asistencia manualmente; el ajuste queda marcado como tal y se registra en bitácora con usuario, fecha y motivo.  
> * Quien asiste pero no aprueba queda con asistencia registrada y sin créditos.

### **Criterios de aceptación**

> * Cerrada la sesión, la lista de asistencia y los créditos quedan consolidados sin captura manual.  
> * Los resultados alimentan directamente el expediente (M7) y los indicadores (M8) sin proceso intermedio.  
> * Es posible distinguir en cualquier reporte los registros por QR de los ajustes manuales.

## 

## **M7 · Expediente digital, constancias y diplomas**

**Objetivo.** Concentrar la trayectoria formativa de cada persona servidora pública y emitir sus acreditaciones.  
**Actores.** Servidor Público (consulta y descarga lo propio), Titular de Área y Dependencia (consultan su personal), Capacitación (consulta total y administra plantillas de diploma).

### **Contenido del expediente individual**

| Campo | Origen |
| :---- | :---- |
| Datos generales: nombre, número de empleado, puesto | M1 |
| Dependencia y unidad administrativa de adscripción actual | M1 |
| PAC asignado del ejercicio | M4 |
| Historial de asistencias validadas | M6 |
| Créditos acumulados, con desglose por capacitación | M6 |
| Diplomas y constancias obtenidos | Este módulo |
| Porcentaje de cumplimiento respecto al PAC asignado | Calculado (M8) |

### **Funcionalidades**

> * Vista consolidada del expediente, con filtro por ejercicio y acumulado de trayectoria institucional.  
> * Generación automatizada del diploma o constancia en PDF al acreditarse una sesión, a partir de plantillas administrables: logotipo institucional, texto, nombre, tema, horas, fecha y créditos.  
> * Folio único y código QR de verificación impresos en cada documento. El QR abre una página pública que confirma la validez del documento, el nombre de la persona, el tema y la fecha.  
> * Descarga individual por el propio servidor público y descarga masiva por sesión para Capacitación.  
> * Reimpresión de documentos históricos conservando el folio original.  
> * Administración de plantillas de diploma por tipo de capacitación.

### **Reglas**

> * El folio es único, permanente y no reutilizable, incluso si el documento se reimprime.  
> * El expediente sólo es visible para la propia persona, su Titular de Área, su Dependencia y Capacitación.  
> * Una baja en la plantilla conserva el expediente y sus documentos.

### **Criterios de aceptación**

> * Toda sesión acreditada genera un documento descargable sin intervención manual.  
> * La verificación por QR responde correctamente desde un dispositivo sin sesión iniciada.

*Nota de diseño:* las plantillas reservan el espacio de firma, de modo que incorporar el banco de firmas en una fase posterior no exija rediseñar el documento.

## 

## **M8 · Seguimiento, estadísticas y reportes**

**Objetivo.** Dar visibilidad del cumplimiento en cada nivel de jerarquía y sustentar el seguimiento y la toma de decisiones.  
**Actores.** Servidor Público, Titular de Área, Dependencia, Capacitación, Capacitador.

### **Indicadores**

> * **Porcentaje de cumplimiento** \= sesiones acreditadas / sesiones del PAC asignado en el ejercicio. Se calcula por persona, unidad administrativa y dependencia.  
> * **Porcentaje de cumplimiento por capacitación** \= participantes que acreditaron / participantes asignados a esa capacitación.  
> * **Créditos acumulados** por persona, unidad administrativa y dependencia.  
> * **Índice de asistencia** \= asistentes registrados / participantes asignados.  
> * **Índice de aprobación** por tema y por capacitador.  
> * **Avance del plan anual** \= líneas impartidas / líneas planeadas, por responsable (M3).

### **Vistas por rol**

| Rol | Qué visualiza |
| :---- | :---- |
| Servidor Público | Su PAC asignado, su porcentaje de cumplimiento, su asistencia, su calendario, sus créditos y sus diplomas obtenidos. |
| Titular de Área | El PAC asignado de su área; porcentaje de cumplimiento del área y por capacitación; gráficas de cumplimiento y de créditos del área; y los datos de los servidores públicos adscritos: asistencia, cumplimiento y créditos. |
| Dependencia | El agregado de todas sus unidades administrativas, con el mismo nivel de detalle que el Titular de Área. Rol de consulta únicamente. |
| Capacitación | Vista institucional completa, con los datos de todos los servidores públicos y comparativo entre dependencias. |
| Capacitador | Avance de su propio plan anual, asistencia y aprobación de las sesiones que impartió. |

### **Funcionalidades**

> * Tablero con indicadores y gráficas de cumplimiento y créditos, filtrable por ejercicio, dependencia, unidad administrativa, tema y capacitador.  
> * Detalle descendente: de dependencia a unidad administrativa, y de ahí a servidor público.  
> * Reportes exportables a PDF y hoja de cálculo: cumplimiento por dependencia y unidad administrativa, asistencia por sesión, créditos por servidor público, e histórico por persona.

### **Reglas**

> * Los indicadores se calculan exclusivamente sobre asistencias y créditos validados en M6.  
> * Ningún rol accede a información fuera de su nivel jerárquico.  
> * Los porcentajes de ejercicios cerrados no se recalculan al modificarse catálogos o programación del ejercicio en curso.

### **Criterios de aceptación**

> * Cada rol ve exactamente el conjunto de datos listado en la tabla de vistas.  
> * El porcentaje de cumplimiento mostrado a una persona coincide con el que ve su Titular de Área para esa misma persona.

## **Estimación de desarrollo por módulo**

| \# | Módulo | Días | Qué concentra el esfuerzo |
| :---- | :---- | :---- | :---- |
| M1 | Personas servidoras públicas, plantilla y perfiles | 6 | Conciliación de altas, bajas y cambios de adscripción; bitácora histórica; extensión de perfil de capacitador |
| M2 | Catálogo de Temas | 2 | CRUD sobre componentes existentes |
| M3 | Plan Anual de Capacitación (PAC institucional) | 2 | Líneas del plan, vista de línea de tiempo, duplicado del ejercicio anterior |
| M4 | Programación, Calendario, Convocatorias e Inscripción | 5 | Sesiones, cupos, traslapes, habilitación mensual, inscripción abierta |
| M5 | Notificaciones automatizadas | 3 | Plantillas, cola de envío con reintento, bitácora |
| M6 | Cuestionario de Evaluación, Asistencia por QR y Créditos | 7 | Ventana de vigencia del QR, validación de participantes, asignación automática de créditos |
| M7 | Expediente digital, constancias y diplomas | 5 | Motor de PDF, folio único, página pública de verificación |
| M8 | Seguimiento, estadísticas y reportes | 5 | Indicadores, gráficas por rol, reportes exportables |
|  | **Subtotal de desarrollo** | **35** |  |
|  | QA, pruebas de aceptación, ajustes y despliegue | 5 | Transversal, al cierre de cada bloque |
|  | **Total** | **40** |  |

## 

## **Secuencia de entrega**

| Bloque | Módulos | Días | Entregable verificable |
| :---- | :---- | :---- | :---- |
| 1 · Datos base | M1, M2 | 8 | Plantilla de personal cargada y catálogo de temas operando |
| 2 · Planeación y programación | M3, M4, M5 | 10 | Un curso planeado, programado, convocado y notificado |
| 3 · Operación | M6 | 7 | Asistencia registrada por QR y créditos asignados automáticamente |
| 4 · Salidas | M7, M8 | 10 | Diploma emitido y tableros de cumplimiento en línea |
| Cierre | QA y despliegue | 5 | Sistema en producción |

