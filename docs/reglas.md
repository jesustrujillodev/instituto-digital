# Reglas Base para Proyectos Agnosticos de Framework

Fecha: 2026-10-01
Version: 1.2
Objetivo: Definir reglas obligatorias para iniciar proyectos nuevos con logica de negocio portable, escalable y facil de mantener a largo plazo.

Base de referencia: este estandar define una taxonomia modular y reglas de comentarios para proyectos agnosticos.

## 1. Principios no negociables

1. La logica de negocio no conoce el framework.
2. El framework se trata como detalle de implementacion, no como nucleo de arquitectura.
3. Todo acceso a infraestructura se hace por interfaces, nunca por llamadas directas desde dominio.
4. Ninguna regla de negocio depende de request, response, router, hooks o componentes.
5. Cada decision arquitectonica relevante queda documentada en ADR.

## 2. Capas obligatorias

Definir siempre estas capas desde el dia 1:

- Dominio: entidades, value objects, reglas de negocio puras.
- Aplicacion: casos de uso y orquestacion.
- Puertos: contratos de entrada y salida.
- Adaptadores: implementaciones concretas de framework, base de datos, HTTP, colas, cache.
- Presentacion: UI y controladores de entrada.

Regla:

- Las dependencias solo pueden apuntar hacia adentro.
- Dominio no importa nada de aplicacion, adaptadores ni presentacion.

## 3. Estructura minima de carpetas

Usar esta estructura base en proyectos nuevos:

- src/modules/<modulo>
- src/shared
- src/platform
- docs/adr

Nota:

- Si se usa monorepo, mantener la misma separacion por paquete.
- Dentro de cada modulo, aplicar la taxonomia obligatoria definida en la seccion 21.
- El core del negocio se modela dentro de cada modulo (entity, ports, service), no en una carpeta global unica.

## 4. Reglas de importacion

1. Prohibido importar librerias de framework dentro de core.
2. Prohibido importar adaptadores dentro de domain o application.
3. Permitido: application depende de ports y domain.
4. Permitido: adapters depende de ports y librerias externas.
5. Presentacion solo puede llamar casos de uso a traves de puertos de entrada.

Control recomendado:

- Configurar reglas de boundaries en lint para bloquear imports invalidos. En este proyecto viven en `.dependency-cruiser.cjs` y se ejecutan con `bun run lint:arch` dentro del pre-commit.

## 5. Contratos de entrada y salida

Toda operacion de negocio debe tener:

- Input DTO de caso de uso.
- Output DTO de caso de uso.
- Errores tipados de negocio.

Reglas:

- Nunca retornar tipos de framework en core.
- Nunca lanzar errores de framework desde core.
- Todo DTO debe ser serializable y estable.
- El Output DTO viaja SIEMPRE dentro del envelope estandar de respuesta (seccion 25).

## 6. Manejo de errores agnostico

Definir un modelo unico de errores:

- DomainError
- ApplicationError
- InfrastructureError

Cada error debe incluir:

- Codigo estable
- Mensaje tecnico
- Mensaje de usuario opcional
- Metadata opcional

Regla:

- Mapeo a HTTP, GraphQL, UI o cola solo en adaptadores.

## 7. Autenticacion y autorizacion

1. Las reglas de permisos viven en application o domain.
2. La extraccion de identidad desde token, cookie o header vive en adapters.
3. El core solo recibe contexto de identidad normalizado.
4. Nunca usar objetos de sesion del framework dentro del core.

## 8. Persistencia y servicios externos

1. Repositorios siempre por interfaces.
2. Clientes HTTP, SDKs, ORM y query builders solo en adaptadores.
3. Prohibido que casos de uso conozcan endpoints, SQL o detalles de proveedor.
4. Todo timeout, retry y circuit breaker en capa de infraestructura.

### 8.1 Transaccionalidad y ACID (obligatorio en operaciones criticas)

Reglas:

1. Toda operacion de negocio con multiples escrituras relacionadas debe ejecutarse en una transaccion explicita.
2. No se permite implementar flujos multi-paso de escritura (create/update/delete en varias entidades) sin frontera transaccional.
3. Si una operacion no puede ser totalmente atomica por depender de sistemas externos, debe aplicar patron de compensacion o estrategia de consistencia eventual documentada.
4. El nivel de aislamiento debe elegirse por caso de uso y documentarse cuando no sea el default.
5. Ninguna regla ACID debe depender del frontend; la garantia transaccional vive en backend e infraestructura de datos.

Criterio practico:

- Escritura simple de una sola entidad: atomicidad por sentencia suele ser suficiente.
- Escritura compuesta de varias entidades o tablas: transaccion explicita obligatoria.
- Procesos largos o distribuidos: consistencia eventual + idempotencia + compensacion.

## 9. UI y estado

1. Componentes UI no contienen reglas de negocio.
2. Hooks solo para interaccion y estado de vista.
3. Formularios se validan en dos niveles:
    - Validacion de UX en UI
    - Validacion canonica en application o domain
4. Estado global no debe almacenar objetos acoplados al framework.

## 10. Framework adapter pattern obligatorio

Para cualquier framework usar adaptador de entrada:

- Adapter recibe request o evento de framework.
- Adapter transforma a Input DTO.
- Adapter ejecuta caso de uso.
- Adapter transforma Output DTO a respuesta del framework.

Regla:

- Si se cambia framework, se reemplaza adapter, no core.

## 11. Inyeccion de dependencias

1. Composition root unico por runtime.
2. Registro por interfaces, no por clases concretas en core.
3. Lifetimes definidos explicitamente.
4. Prohibido crear dependencias manualmente dentro de casos de uso.
5. Prohibido resolver una dependencia con estado por import directo. En particular: un adaptador inbound (loader/action/controlador) nunca importa un servicio, y un caso de uso nunca importa un repositorio o cliente de infraestructura. Ambos se resuelven por el contenedor.
6. Toda dependencia inyectable se declara en el registry tipado del contenedor, tipada contra el puerto de dominio y nunca contra la implementacion concreta.
7. Se importan directo, por no ser inyectables: tipos e interfaces, funciones puras (reglas, mappers, validadores), clases de error, constantes de configuracion del modulo, componentes de UI y librerias de terceros dentro de su capa.

## 12. Testing obligatorio para migrabilidad

Minimos por modulo:

- Unit tests de domain y application.
- Contract tests para puertos y adaptadores.
- Integration tests para adaptadores criticos.
- E2E para flujos principales.

Estructura de los tests:

- Todos los tests realizados deben de seguir la estructura triple A (AAA):
    - Arrange: Setup del test, incluyendo mockeo de dependencias si es necesario.
    - Act: Ejecucion del codigo bajo prueba.
    - Assert: Verificacion de los resultados esperados.

Cobertura obligatoria:

- Toda operacion que genere mutaciones en la base (create, update, delete, archive/restore y mutaciones de estado de seguridad) debe tener prueba. No es opcional ni se difiere a un PR posterior.
- Por cada operacion mutadora: un test del caso de uso con el repositorio como doble, un test de las reglas de dominio que la gobiernan, y un test del error tipado que puede lanzar, verificando su `code` y nunca su `message`.

Ubicacion obligatoria:

- Todo archivo de prueba vive en una carpeta `__tests__/` dentro del directorio de la capa que prueba (`domain/__tests__/`, `application/__tests__/`, `infrastructure/__tests__/`). Un `__tests__/` por capa, no uno por modulo.
- Prohibido que un archivo de prueba conviva en el mismo directorio que el archivo bajo prueba.
- El descubrimiento del runner se restringe a ese patron, de modo que un test mal ubicado no se ejecuta.

Meta recomendada:

- Al menos 70 por ciento de cobertura en core.

Regla:

- Ninguna prueba de core debe levantar framework.

## 13. Observabilidad y trazabilidad

1. Logging estructurado con correlation id.
2. Metricas por caso de uso.
3. Trazas de errores por codigo estable.
4. Eventos de auditoria separados de logs tecnicos.

## 14. Convenciones de versionado de contratos

1. Versionar DTOs publicos cuando cambien.
2. Cambios breaking requieren plan de compatibilidad.
3. Mantener changelog tecnico por contratos.

## 15. Definition of Done arquitectonico

Una historia se considera terminada solo si:

1. Cumple reglas de capas y dependencias.
2. Incluye pruebas de core y adaptador.
3. No introduce tipos de framework en core.
4. Incluye ADR si hubo decision de arquitectura.
5. Pasa gates de CI de agnosticidad.
6. Si el cambio incluye escritura compuesta, define y prueba su estrategia transaccional (ACID o compensacion).
7. Si el cambio agrega o modifica un adaptador de entrada que lee datos (loader, controller, resolver), cumple la seccion 26: sin cascadas de llamadas independientes, sin N+1 y sin leer colecciones completas para contarlas.

## 16. Gates de CI obligatorios

Agregar pipeline con validaciones automaticas:

- Lint de boundaries
- Typecheck estricto
- Test de core
- Contract tests
- Deteccion de imports prohibidos en core
- Verificacion de casos criticos con pruebas de transaccion/consistencia

Regla de bloqueo:

- Si falla cualquier gate de agnosticidad, no se hace merge.

## 17. Antipatrones prohibidos

1. Casos de uso que reciben request o response de framework.
2. Servicios de negocio que llaman router, redirect o utilidades de framework.
3. Repositorios devolviendo respuestas crudas del proveedor sin mapear.
4. Validaciones de negocio solo en UI.
5. Manejo de errores mezclando codigos de negocio con codigos HTTP.
6. Casos de uso que devuelven formas ad-hoc en vez del envelope estandar (seccion 25).
7. Escaleras de `instanceof` por error de dominio repetidas en cada adaptador de entrada.
8. Mensajes de error sin tipar propagados al cliente (pueden filtrar SQL, rutas o secretos).
9. Cascadas de `await` sobre llamadas que no dependen entre si en un adaptador de entrada (seccion 26).
10. Consultas dentro de un bucle o un `map` por cada fila (N+1).
11. Leer una coleccion o un arbol completo solo para contar sus elementos.
12. Optimizar sin una medicion antes y despues.

## 18. Checklist de arranque para proyectos nuevos

Antes de empezar funcionalidades, completar:

1. Estructura de carpetas modular creada (seccion 3).
2. Plantilla de caso de uso con Input y Output DTO.
3. Modelo de errores tipado implementado.
4. Primer adaptador inbound e outbound funcional.
5. Reglas de lint para boundaries activas.
6. Pipeline CI con gates de agnosticidad.
7. ADR inicial de decisiones base.
8. Ejemplo de prueba unitaria y contract test listos.
9. Politica de transacciones y consistencia definida para operaciones criticas del dominio.

## 19. Roadmap sugerido de adopcion

Objetivo de esta seccion:

- Acelerar entrega de features sin degradar arquitectura.
- Reducir deuda tecnica temprana.
- Estandarizar calidad tecnica para equipos nuevos.

Semana 1:

- Bootstrapping de arquitectura, DI, errores, lint boundaries y CI.

Valor operativo:

- Evita decisiones improvisadas en features iniciales.
- Reduce retrabajo por acoplamiento prematuro.

Semana 2:

- Primer modulo vertical completo con patron adapter.

Valor operativo:

- Valida la plantilla real de desarrollo end-to-end.
- Detecta fricciones antes de escalar al resto de modulos.

Semana 3:

- Endurecer pruebas, observabilidad y documentacion de contratos.

Valor operativo:

- Mejora la confiabilidad de cambios frecuentes.
- Disminuye regresiones en releases.

Semana 4:

- Revisar deuda tecnica, ajustar plantilla y congelar estandar para el resto del proyecto.

Valor operativo:

- Homologa forma de trabajo entre desarrolladores.
- Mantiene velocidad de desarrollo sostenida a mediano plazo.

## 20. Meta de sostenibilidad arquitectonica

Objetivo minimo para considerar un proyecto sano, escalable y preparado para cambios mayores:

- Core completamente libre de imports de framework.
- Al menos 90 por ciento de casos de uso ejecutables en tests sin runtime web.
- Adaptadores reemplazables con impacto controlado y sin cambios en domain.

Utilidad practica (aunque nunca migres de framework):

- Menor costo de mantenimiento por feature.
- Menor riesgo de regresiones al refactorizar.
- Onboarding mas rapido para nuevos desarrolladores.
- Mayor estabilidad en despliegues y releases.
- Flexibilidad para integrar nuevos canales (API, jobs, UI) sin reescribir negocio.

Si no se cumplen estas 3 condiciones, el proyecto no se considera realmente agnostico.

## 21. Taxonomia de archivos por modulo

Todo modulo nuevo debe usar una taxonomia explicita de archivos para separar responsabilidades.

Archivos obligatorios por modulo:

- <modulo>.entity.ts: entidad y tipos de dominio del modulo.
- <modulo>.ports.ts: interfaces de repositorio, servicio y controlador/casos de uso.
- <modulo>.schema.ts: contratos de validacion de entrada/salida en frontera.
- <modulo>.repository.ts: adaptador de persistencia o integracion externa.
- <modulo>.mapper.ts: conversion entre modelos externos, internos y DTO.
- <modulo>.service.ts: logica de aplicacion/casos de uso.
- <modulo>.controller.ts: adaptador inbound para entrada del framework.

Archivos opcionales segun necesidad:

- <modulo>.constants.ts: constantes del modulo.
- <modulo>.types.ts: tipos auxiliares no propios del dominio.
- <modulo>.routes.ts: declaracion de rutas/middlewares cuando el modulo expone capa API/routing explicita (por ejemplo, REST/RPC).
- <modulo>-<caso>.routes.ts: rutas especializadas por caso de uso.
- `__tests__/` por capa del modulo (`domain/`, `application/`, `infrastructure/`) con pruebas unitarias, de integracion y de contrato.

Reglas:

1. No mezclar responsabilidades (por ejemplo, validaciones en repository).
2. Todo modulo debe poder entenderse leyendo estos archivos en orden: entity, ports, schema, mapper, service, controller; y routes cuando aplique.
3. Si un archivo supera 300 lineas, dividirlo por subdominio o caso de uso.

## 22. Reglas de comentarios claras (obligatorias)

Objetivo: comentarios consistentes, utiles y auditables; sin ruido.

### 22.1 Encabezados por seccion

Usar separadores de bloque para secciones relevantes dentro de archivos medianos/grandes:

// ===============================================================
// Nombre de la seccion
// ===============================================================

Regla:

- Solo para secciones reales (tipos, mappers, api publica, helpers, etc.).

### 22.2 JSDoc en API publica

Todo elemento exportado de uso externo debe tener JSDoc breve cuando no sea trivial:

- Factories principales.
- Funciones de dominio no obvias.
- Middlewares y controladores.
- Contratos criticos en puertos.

Reglas:

1. Explicar el "por que" o la regla de negocio, no repetir el nombre de la funcion.
2. Incluir precondiciones o restricciones cuando aplique.
3. No documentar lo obvio ni duplicar tipos.

### 22.3 Comentarios inline

Permitidos solo cuando aclaran decisiones no evidentes:

- Seguridad.
- Compatibilidad.
- Performance.
- Workarounds temporales.

Prohibido:

- Comentarios narrativos linea por linea.
- TODO sin ticket o referencia.
- Comentarios desactualizados.

### 22.4 Comentarios de rutas y endpoints

Cuando exista archivo de rutas, debe incluir comentarios cortos de intencion por endpoint:

- Metodo + path.
- Objetivo del endpoint.
- Restriccion de seguridad relevante (si aplica).

## 23. Plantilla minima por modulo

Checklist de creacion de modulo:

1. Crear <modulo>.entity.ts con modelo de dominio.
2. Crear <modulo>.ports.ts con contratos de repositorio/servicio/controlador.
3. Crear <modulo>.schema.ts con validaciones de entrada/salida.
4. Crear <modulo>.mapper.ts para conversiones.
5. Crear <modulo>.repository.ts sin reglas de negocio.
6. Crear <modulo>.service.ts con casos de uso.
7. Crear <modulo>.controller.ts como adaptador de framework.
8. Crear <modulo>.routes.ts con middlewares y endpoints solo cuando el modulo exponga una capa API/routing explicita fuera del filesystem router.
9. Crear los `__tests__/` de cada capa con minimo: 1 unit test de service en `application/__tests__/`, 1 contract test de repository en `infrastructure/__tests__/`, 1 integration test del adaptador inbound (route o equivalente).

Regla de calidad:

- Ningun PR de modulo nuevo se aprueba si faltan 2 o mas archivos obligatorios de la taxonomia.

## 24. Nomenclatura obligatoria (ingles)

Regla general:

- Nombres de archivos, carpetas, variables, funciones, tipos e interfaces deben estar en ingles.
- Se permite espanol unicamente en campos de base de datos y en valores de negocio persistidos (por ejemplo, enums o catálogos ya definidos en DB).

Reglas practicas:

1. No introducir nuevos identificadores en espanol fuera de capa de esquema/persistencia.
2. Si un modulo historico mantiene nombres en espanol por compatibilidad, cualquier codigo nuevo dentro de ese modulo debe priorizar nombres en ingles.
3. En refactors incrementales, renombrar primero variables y funciones internas; renombrar contratos publicos solo cuando exista plan de migracion para no romper consumidores.

## 25. Contrato estandar de respuestas (obligatorio)

Objetivo: que un adaptador de entrada (loader, action, controller, job) pueda consumir CUALQUIER caso de uso sin conocer la lista de errores del modulo. Una sola forma, un solo punto de desempaquetado, un solo sitio donde se decide que se le muestra a una persona.

### 25.1 La forma

Union discriminada por `success`. No un objeto plano con `success: boolean`: eso permite estados imposibles (`{ success: true, error }`) y no estrecha el tipo.

```
Ok<T>  = { success: true;  data: T; message?: string; pagination?: PaginationMeta; timestamp: string }
Fail   = { success: false; error: { code: string; message: string;
           fieldErrors?: Record<string,string>; details?: Record<string,unknown> }; timestamp: string }

AppResponse<T> = Ok<T> | Fail
```

`PaginationMeta = { page, pageSize, total, totalPages }`.

Reglas de la forma:

1. `pagination` va en la raiz, no anidado en un `meta`. Solo aparece en listados.
2. `code` es un codigo estable de negocio, NUNCA un status HTTP. La traduccion a HTTP es del adaptador.
3. `message` de la rama Fail es tecnico en el servicio y de usuario tras pasar por el diccionario del modulo.
4. `fieldErrors` es `{ campo: mensaje }` y se pinta junto a su input, nunca en un toast generico.
5. `details` transporta datos serializables que el adaptador necesita para redactar el mensaje (por ejemplo `retryAfterMs`).
6. `timestamp` es obligatorio y lo pone el constructor, no quien llama.

Los esquemas viven en un unico sitio y los tipos se derivan de ellos; no se escriben dos veces.

### 25.2 Quien construye que

| Capa | Devuelve | Lanza |
| --- | --- | --- |
| Repositorio / adaptador de persistencia | modelo de dominio crudo | errores de dominio tipados |
| Servicio (application) | `AppResponse<T>` SIEMPRE | nada esperado |
| Loader | `Ok<T>`; corta con error de ruta si el servicio falla | error de ruta (status) |
| Action | `AppResponse<T>` | solo redirects/Response deliberados |

Reglas:

1. El repositorio NO conoce el envelope. Sigue lanzando errores de dominio tipados: es lo que permite que un `catch` unico los convierta.
2. El servicio no lanza para fallos esperados. Un registro inexistente o un duplicado son respuestas, no excepciones.
3. Ningun `throw` puede escapar del servicio. Toda operacion se envuelve en un runner que captura, tipa y registra.
4. El loader corta (status HTTP + ErrorBoundary) porque no tiene pantalla que mostrar; el action responde `success: false` porque la pantalla sigue en pie.

### 25.3 Normalizacion de errores

Existe una base unica de errores de negocio; todo error de dominio la extiende. La conversion `unknown -> error del envelope` es una sola funcion con tres casos:

1. Error de validacion de frontera -> codigo `VALIDATION_ERROR` + `fieldErrors`.
2. Error de dominio (extiende la base) -> conserva su `code`, su `message` y sus `details`.
3. Cualquier otro -> `UNEXPECTED_ERROR` con mensaje generico.

Regla de seguridad no negociable:

- El mensaje de un error NO tipado nunca viaja al cliente. Puede contener SQL, rutas del sistema de archivos, hosts internos o secretos. Se registra en el log a nivel `error` y se responde generico.
- No basta con que un objeto tenga `code`: debe extender la base de errores de dominio. Los errores de Node (`ENOENT`, `ECONNREFUSED`) tambien tienen `code`.

Logging:

- Fallo conocido -> `debug` con el codigo. El mensaje ya viaja en la respuesta.
- Fallo inesperado -> `error` con el mensaje y el stack reales.
- El logging vive en el runner del servicio, no repetido en cada adaptador.

### 25.4 Copia de usuario

La copia que lee una persona es decision de PRESENTACION, no de dominio. Cada modulo declara un diccionario `codigo -> copia` en su capa de adaptador:

- Clave: el codigo estable (constante exportada por el modulo, no un string suelto).
- Valor: texto, o `{ message, status?, fieldErrors? }` cuando hace falta status HTTP o error por campo.
- `message` puede ser funcion cuando el texto depende de `details`.
- Debe existir una entrada de reserva para `UNEXPECTED_ERROR`.

Reglas:

1. Prohibido escalonar `instanceof` por error de dominio en un adaptador. Anadir un error nuevo debe requerir tocar SOLO el diccionario.
2. El `code` nunca se traduce ni se reescribe: es lo que permite a cliente y tests distinguir el caso sin comparar strings de UI traducibles.
3. `status` solo lo consultan los loaders. Un action no corta con status.

### 25.5 Excepciones permitidas

Un caso de uso puede quedar fuera del envelope solo si se cumplen las dos condiciones:

1. No lo consume ningun adaptador de entrada (es infraestructura interna: middleware, refresco de tokens, jobs de arranque).
2. El consumidor necesita distinguir clases de fallo para decidir su flujo, y no hay pantalla al otro lado que muestre un error.

La excepcion se documenta en el puerto (`<modulo>.service.ts`) explicando por que. Sin comentario, no hay excepcion.

### 25.6 Definition of Done

Un modulo cumple esta seccion cuando:

1. Su puerto de servicio declara `AppResponse<T>` en todos los metodos consumidos por adaptadores.
2. Su implementacion envuelve cada operacion en el runner.
3. Tiene diccionario de copia con entrada de reserva.
4. Ningun loader/action del modulo contiene `instanceof` de errores de dominio ni construye literales `{ success: ... }` a mano.
5. Sus defaults de paginacion viven en un unico sitio y son los mismos que usa el repositorio para el `skip`/`take`.

## 26. Rendimiento de lectura en adaptadores de entrada (obligatorio)

Objetivo: que una pantalla cargue en el menor numero de viajes a la base sin cambiar lo que muestra ni quien puede verlo.

### 26.1 Modelo de costo

En una aplicacion con render en servidor y base de datos remota, el tiempo de un adaptador de entrada es aproximadamente:

```
tiempo ≈ viajes a la base en la ruta critica × latencia por viaje
```

La latencia por viaje (decenas de ms entre regiones, unos pocos dentro de la misma) domina sobre el CPU y sobre el tamano de los datos. Lo que se optimiza es **cuantos viajes van en fila**, no cuantos bytes viajan.

### 26.2 Medir antes y despues

1. Ninguna optimizacion sin medicion previa. El proyecto debe contar con un contador de consultas y de tiempo por peticion, activable solo en desarrollo por una bandera de entorno y sin costo cuando esta apagado.
2. Se toma una linea base de las rutas afectadas y se repite la medicion al terminar. La tabla antes/despues va en la descripcion del PR.
3. Se mide con el servidor recien arrancado: tras muchas recargas en caliente (HMR), los clientes de base de datos globales pueden quedar mezclados con modulos reevaluados y dar cifras o errores falsos.

### 26.3 Reglas

1. **Una lectura, un viaje.** Las relaciones anidadas de una lectura viajan en la misma consulta (joins del ORM), no en una consulta por relacion. Prohibido consultar dentro de un bucle por cada fila (N+1): se agrupa con `IN` y se arma en memoria.
2. **Paralelizar lo independiente.** Se dibuja el grafo de dependencias de cada adaptador: va en serie solo lo que necesita el resultado de otra llamada. Lo demas va en una sola fase paralela (`Promise.all` o equivalente). Los errores se comprueban despues, en el mismo orden de antes, para que el error que gana siga siendo el mismo.
3. **Decidir antes de leer.** Redirecciones, autorizacion y validaciones que dependen de poco van primero. No se lee nada que una redireccion vaya a descartar.
4. **Leer solo lo que la vista pinta.** Si la vista solo cuenta, se pide un conteo; si solo usa algunos campos, una proyeccion. Las colecciones y arboles completos se leen solo en la vista que los muestra.
5. **No releer lo que ya se tiene.** Si el adaptador ya tiene un registro leido y autorizado, lo pasa al caso de uso como argumento en lugar de que el caso de uso lo vuelva a buscar.
6. **Revalidar solo lo que cambia.** Tras una mutacion, los adaptadores de lectura cuyo resultado no puede cambiar no se vuelven a ejecutar. La decision vive en una funcion pura y probada, nunca en una condicion suelta en el componente.
7. **Cachear solo con semantica segura.** Una respuesta que depende de quien la pide se cachea como privada y nunca en una cache compartida. Un recurso firmado o con caducidad se cachea menos tiempo del que vive.

### 26.4 Garantia de comportamiento identico

1. Toda optimizacion conserva cuatro invariantes: las mismas redirecciones, los mismos errores (con el mismo diccionario de copia), los mismos permisos y la misma forma de la respuesta. Si una lectura cambia de puerta de acceso (por ejemplo, de un servicio a otro), se demuestra que ambas aplican el mismo alcance.
2. La equivalencia se comprueba, no se supone: se capturan las respuestas de las rutas afectadas antes y despues, se decodifican y se comparan campo por campo, ignorando solo marcas de tiempo y firmas. Las unicas diferencias admitidas son las previstas, y se documentan en el PR.
3. Un cambio de configuracion del ORM (por ejemplo, una funcion en preview) se valida igual. Si altera un solo resultado o rompe una prueba, se revierte entero.

### 26.5 Costo contra riesgo

1. Se optimiza lo que la medicion senala, empezando por lo que mas viajes ahorra con menos cambio.
2. Si la ganancia medida es pequena y el cambio arriesga alterar resultados (reescribir filtros delicados, mover reglas de autorizacion), se descarta.
3. Lo descartado se registra en el PR con su medicion y su motivo, para que nadie lo vuelva a evaluar desde cero.

### 26.6 Checklist por adaptador de entrada

1. ¿Cuantos viajes van en serie? Medido con el contador.
2. ¿Que llamadas dependen de otras? Las independientes van en una sola fase paralela.
3. ¿Hay consultas por fila? Se agrupan.
4. ¿La vista usa todo lo que se lee? Si solo cuenta, conteo.
5. ¿Hay decisiones que se pueden tomar antes de leer lo demas?
6. ¿Que mutaciones lo revalidan sin necesidad?
7. ¿Conserva redirecciones, errores, permisos y forma? Comprobado con la comparacion de respuestas.
