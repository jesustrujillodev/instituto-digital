# ADR 0013 · Material de la lección

**Estado:** aceptado · 2026-09-22
**Contexto del cambio:** MVP-02 · F-04, lo que la lección enseña

## 1. Contexto

[ADR-0012](./0012-estructura-de-contenido-y-modulo-propio.md) dejó el esqueleto
del temario y su pendiente escrito: «queda pendiente para el material de la
lección: `lesson_content`, su fuente de referencias de storage y el `type` que hoy
solo se guarda».

Eso es literalmente lo que pasa: `Lesson.type` se elige al crear la lección —el
comentario del schema dice que decide «el editor que se abre»— y ese editor no
existe. Un curso autogestivo se publica con un temario que no enseña nada.

El alcance del MVP-02 dejaba dos decisiones abiertas que bloqueaban la ficha: en
qué formato se escribe el texto (D-02) y si el video se aloja o se enlaza (D-03).

## 2. Decisiones

### 2.1 El cuerpo de texto es un árbol JSON, no Markdown ni HTML

Tres formatos posibles para la columna. El editor es un eje aparte: cualquiera de
ellos admite `textarea` o barra de botones.

| Opción | Veredicto |
| --- | --- |
| HTML crudo | Rechazada por el propio alcance: cada lectura es un vector de XSS sobre la sesión de quien lee |
| Markdown | Rechazada: pintarlo pide un parser, un saneador, un `dangerouslySetInnerHTML` y su `biome-ignore` —la regla está activa y hoy solo hay tres usos, los tres con entrada controlada—. La variante sin `innerHTML` (`react-markdown`) arrastra `remark`/`unified` al bundle **del participante** |
| **Árbol JSON** | **Elegida.** Se recorre y se emiten elementos React. React escapa el texto por sí solo: no hay parser, no hay saneador y no queda superficie que mantener parcheada |

El precedente está en casa: `notification.templates.ts` ya escribe una unión de
bloques con `switch` exhaustivo, y `theme.mapper.ts` ya lee un blob JSON con
validación tolerante. Esto es lo mismo con un árbol en vez de una lista.

Lo que sostiene la promesa son **dos piezas que se leen juntas**: `lessonBodyRule`
es una lista blanca cerrada de nodos y marcas —un nodo desconocido se **rechaza**,
no se ignora— y `LessonBodyView` solo sabe pintar esos nodos. Activar una
extensión del editor que el renderizador no conoce rompe el guardado, que es
donde se quiere que rompa.

El `href` de un enlace solo admite `http(s)`. Es lo único que impide un
`javascript:` almacenado, porque a diferencia del resto del árbol ese valor
termina en un atributo que el navegador ejecuta.

**Tiptap es el editor, y eso no ata el formato.** Su núcleo es MIT; lo que se
paga son las extensiones Pro y Tiptap Cloud, y no se usa ninguna. Se carga con
`lazy`: el participante nunca lo descarga, porque para leer basta el renderizador
propio.

### 2.2 La profundidad se comprueba antes de parsear, y sin recursión

Un documento absurdamente anidado agotaría la pila **dentro** de valibot, antes de
que ninguna regla pudiera rechazarlo. Por eso el tope de bytes y el de niveles
corren como `v.check` sobre el valor crudo, delante del esquema estructural, y el
de niveles recorre el árbol con una pila explícita en vez de llamarse a sí mismo.

### 2.3 `VIDEO` es un valor del enum, no un `FILE` con otro MIME

El alcance decía «tres tipos y ni uno más». Se añade el cuarto.

Con un solo `FILE`, la lista de tipos permitidos sería la unión de las dos y el
tope, el mayor de los dos: se aceptaría un PDF de dos gigas. Y el editor de un
video no se parece al de un adjunto —sube igual, pero se reproduce y emite
`ended`—, que es exactamente la razón por la que `type` existe.

### 2.4 El video se aloja, y el archivo no pasa por el servidor

El alcance recomendaba enlazar, y su único argumento era la pérdida de medición.
Ese argumento cae: **el avance es por clase, no por minutos**. Se marca cuando el
video termina, así que no hay segundos que registrar ni posiciones que persistir.

`withStorageTransaction` lee el archivo entero en memoria, lo que vale para una
portada de 5 MB y no para un video. La subida va por **URL firmada de `PUT`**: el
navegador escribe directo en el bucket y el servidor solo firma y confirma.

Tres controles que no son opcionales:

1. **La key la genera el servidor.** Si la mandara el cliente, elegiría dónde cae
   el objeto. Al confirmar se comprueba además que está bajo el prefijo del
   módulo, para que nadie cuelgue de su lección un objeto privado de otro.
2. **La validación corre antes de firmar.** Una URL firmada que no debió emitirse
   ya es el fallo: el objeto se escribe igual aunque la fila se rechace después.
3. **El tamaño se comprueba al confirmar**, con `statObject`. Una firma de `PUT`
   fija el `Content-Type` pero **no** el tamaño. Sin esa comprobación el tope de
   2 GB sería decorativo.

Para leer, el servicio firma una URL de TTL largo en cada carga. Los 300 segundos
del proxy no sirven aquí: el `<video>` pide rangos durante toda la reproducción y
la firma moriría a mitad de un video de 50 minutos.

### 2.5 Sin transcodificación, y dicho en la pantalla

Lo que sube el capacitador es lo que reproduce el navegador: MP4 y WEBM, nada
más. Un `.mov` de teléfono no abre en Chrome.

Eso es MP4 progresivo con `Range`. El *seek*, la pantalla completa y la velocidad
funcionan; lo que no hay es escalera de calidad, así que una conexión mala sufre.
Adaptarla pediría HLS o DASH: `ffmpeg`, segmentos, manifiesto y una cola de
trabajos. Es un subsistema, no una ficha.

### 2.6 El prefijo es privado, y por eso no se toca la política

`documentos/lecciones/` no cuelga de `media/` ni de `profile-photos/`, así que
`isPublicKey` lo deja fuera **sin añadir una línea a `storage.policy.ts`**: el
proxy exige sesión y la caché es `private, no-store`. Es la dirección segura de
una política que falla cerrada.

Servirlo por CDN habría dado caché inmutable y ninguna firma que expire, pero
convierte la URL en un pase permanente para quien la tenga, sin cuenta.

### 2.7 Una lección, un material

`lesson_contents.lesson_id` es único. Si hace falta un PDF junto a un video, son
dos lecciones — que además es lo que el avance por lección va a querer contar por
separado.

Reemplazar un material es volver a subir: no hay variante «sin archivo» en el
contrato, y por eso tampoco hay botón de quitar.

### 2.8 El material tiene su propia ruta

`cursos/:documentId/contenido/:lessonDocumentId`, sin componente: el panel la lee
con `fetcher.load` y le escribe con `fetcher.submit`.

Meterlo en el árbol habría hecho que cada carga del temario arrastrara el cuerpo
de todas las lecciones. Y con ruta aparte, las dos superficies que ADR-0012 §2.4
fijó —el paso del alta y la pantalla del curso publicado— siguen montando el mismo
panel sin saber nada de esto.

## 3. Consecuencias

- Una tabla nueva, un valor de enum y dos métodos en `IStorageProvider`
  (`getUploadUrl`, `statObject`), que el compilador exige a los dos adaptadores.
- `createContentService` gana tres dependencias: `storageProvider`,
  `storageBucket` y `storagePublicBucket`.
- `ObjectOwnerType` gana `"lesson"` y el cradle, su tercera fuente de referencias.
  **Sin ese registro cada archivo borrado quedaría huérfano en el bucket.**
- Dos dependencias nuevas: Tiptap (editor, con `lazy`) y Vidstack (reproductor).
- **El bucket necesita CORS con `PUT` y `Content-Type`.** Es un paso de operación,
  no de código: sin él la subida falla en el navegador con un error opaco.
- Archivar una lección se lleva su objeto del bucket, en *best-effort* y fuera de
  la transacción.
- El árbol del temario dice ahora si cada lección tiene material. Una fila que
  `release` vació deja de contar, aunque la fila siga ahí.
- Queda pendiente para el avance por lección: nadie escucha todavía el `ended` del
  reproductor, no existe `lesson_progress` y `isCompleted` no ha cambiado.
- Queda fuera, a propósito, exigir material para publicar: hoy un `SELF_PACED` se
  publica con lecciones vacías. Añadir ese pendiente toca `PublishCheck`,
  `publishChecklist` y `STEP_OF_CHECK` en `courses`, y encaja mejor cuando
  «completar el contenido» signifique algo.

## 4. Rechazos

| Situación | Código |
| --- | --- |
| Material de una clase distinta a la de su lección | `CONTENT_MATERIAL_MISMATCH` |
| Tipo o tamaño fuera de lo permitido, antes de firmar | `CONTENT_UPLOAD_INVALID` |
| Confirmar una key que el bucket no tiene | `CONTENT_UPLOAD_NOT_FOUND` |
| Un objeto subido que supera el tope | `CONTENT_UPLOAD_TOO_LARGE` |
| Un enlace que no es `http(s)` | `CONTENT_LINK_INVALID` |
| Un nodo o una marca fuera de la lista blanca, o una key fuera del prefijo | Validación de frontera |
