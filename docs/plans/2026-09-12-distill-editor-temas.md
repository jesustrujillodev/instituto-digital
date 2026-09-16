# Distill del editor de temas (`/dashboard/personalizacion`)

**Estado:** implementado · 2026-09-12 — typecheck, biome y 2089 pruebas en verde. Falta la revisión visual en navegador.
**Origen:** `checklist.md:9` — *"Mejorar el editor de temas, botones confusos en etiquetas y sobrecarga de elementos en la interfaz"*.

## Contexto

El builder de temas es la pantalla más densa del dashboard. Superficie afectada:

| Archivo | Líneas | Papel |
|---|---|---|
| `app/modules/theme/routes/personalizacion/index.tsx` | 430 | Shell: barra de 9 acciones, dos columnas, autoguardado |
| `app/modules/theme/components/theme-token-panel.tsx` | 581 | 36 colores en 6 grupos + tipografía, radios, sombras, espaciado |
| `app/modules/theme/components/contrast-panel.tsx` | 174 | ~20 filas WCAG siempre desplegadas |
| `app/modules/theme/components/color-field.tsx` | 313 | Campo OKLCH con área croma×luminosidad inline |

Fuera de alcance: `theme-preview-gallery.tsx` (galería de componentes reales), el
servicio, el action, el repositorio y el modelo de datos.

## Diagnóstico

1. **Nueve acciones al mismo peso.** Duplicar, Nuevo, Guardar borrador, Publicar,
   Activar para todos, Descartar cambios, Probar en la app, Eliminar, Copiar CSS.
   Tres variantes de botón mezcladas y ningún orden que refleje el flujo real
   (`index.tsx:164-340`).
2. **El estado del tema es invisible.** Borrador / publicado / activo son tres
   conceptos del dominio (`theme.service.ts:66-76`) que la pantalla solo insinúa
   con un `·` mudo dentro del desplegable (`index.tsx:178`).
3. **Redundancia de identidad.** El `SelectValue` y el `Input` de nombre enseñan
   la misma cadena, uno junto al otro (`index.tsx:168-198`).
4. **Un toast de éxito cada 1,2 s.** El action de `save-draft` devuelve
   `"Borrador guardado"` (`index.action.ts:150`) y `useFetcherToast` lo anuncia:
   mover un slider treinta segundos son ~25 toasts.
5. **Seis a siete cajas apiladas** en la columna izquierda, con tarjetas dentro de
   tarjetas (el picker de `color-field.tsx:186` es `border bg-card` dentro del
   `border bg-card` de la sección).
6. **36 colores al mismo nivel.** "Gráficas" y "Barra lateral" compiten con
   "Marca"; el usuario real es el dueño de la agencia, no un diseñador
   (`PRODUCT.md` → Users).
7. **Párrafos explicativos repetidos.** Derivar oscuro (3 líneas), contraste (4),
   espaciado (2) y tipografía (2) dicen en prosa lo que cabe en una línea.

## Decisiones tomadas con el usuario

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Alcance | Toda la superficie: index + token-panel + contrast-panel + color-field. Galería intacta. |
| 2 | Ciclo borrador→publicar→activar | **Una acción primaria contextual** + menú de desbordamiento. Sin tocar el servicio. |
| 3 | 36 tokens de color | Superficies, Marca y Estado visibles; Bordes, Gráficas y Barra lateral tras "Avanzado". Sin derivación nueva. |
| 4 | Comportamiento | Presentación + estado visible **+ replanteo del autoguardado y sus avisos**. |

## Cambios

### 1. Acción primaria contextual (nuevo `components/theme-toolbar.tsx`)

Máquina de estados derivada de `ThemeSummary` (ya la sirve el loader; no hace
falta tocar el servidor). Ojo: `hasUnpublishedChanges` es `false` cuando el tema
nunca se publicó (`theme.repository.server.ts:173`), así que el primer publicar
se decide por `isPublished`.

| Estado | Acción primaria |
|---|---|
| `isPreset` | **Duplicar para editar** |
| `!isPublished` | **Publicar** |
| `hasUnpublishedChanges` | **Publicar cambios** |
| `!isActive` | **Activar para todos** |
| resto | **Activo para todos** (deshabilitado, con check) |

Vive en una fila propia bajo `PageHeader`, junto al selector de biblioteca, los
badges de estado y el indicador de guardado. El resto pasa a un `DropdownMenu` (⋯):
Renombrar…, Duplicar, Tema nuevo · Probar en toda la app / Dejar de probar,
Descartar cambios · Importar CSS…, Copiar CSS · Eliminar.

- **Renombrar** deja de ser un input permanente y pasa a un `Dialog` — mata la
  redundancia del punto 3 del diagnóstico.
- **Importar CSS** deja de ser una sección con `Textarea` en la columna
  izquierda y pasa a un `Dialog` — mata una caja entera.
- **Eliminar** gana confirmación con el `ConfirmDialog` compartido
  (`app/shared/components/common/confirm-dialog.tsx`). Antes borraba en un clic
  sin vuelta atrás. Es la única adición de comportamiento fuera de lo pactado; se
  señala explícitamente al entregar.

### 1b. Crear y duplicar abren el tema nuevo

`create` y `clone` son las dos intenciones que devuelven dato:
`{ createdDocumentId }`
(`theme-builder-form.ts` → `ThemeCreated`). El `documentId` nace en el servidor
y el cliente no puede saberlo de otra forma sin diffar la biblioteca.

La ruta lo orquesta en **dos pasos**, no en uno: abrir el tema es una
navegación, y entre `setSearchParams` y la respuesta del loader hay renders en
los que `theme` sigue siendo el anterior. Disparar el diálogo ahí ofrecería
renombrar el tema del que se venía —y lo renombraría de verdad, porque el envío
lleva su `documentId`—. Por eso el segundo efecto espera a que el tema cargado
SEA el nuevo. El diálogo de renombrar pasa a estado controlado por la ruta.

Solo **crear** pide el nombre; **duplicar** se limita a abrir la copia, porque
"X (copia)" ya dice lo que es. La distinción se recuerda al enviar (`askForName`)
y no viaja en la respuesta: cuándo abrir un diálogo es cosa de la pantalla.

### 1c. Selector con la forma del picker de ui.shadcn.com/create

`components/theme-picker.tsx`, reconstruido a partir de
`apps/v4/app/(app)/(create)/components/{theme-picker,picker}.tsx` del repo
`shadcn-ui/ui`. Solo la forma; el comportamiento sigue siendo el nuestro
(`?tema=`, biblioteca del loader).

- Disparador de dos líneas: etiqueta `Tema` en `text-xs text-muted-foreground`
  sobre el nombre en `text-sm font-medium`, `ring-1 ring-foreground/10`,
  `rounded-lg px-2.5 py-2`, sin chevron.
- Punto de color de 16 px a la derecha con el `primary` de la variante en
  edición. En shadcn sale del `primary` oscuro del tema; aquí de la variante
  que se está tocando, que es lo que la pantalla está pintando.
- Popup en **neutros fijos** (`bg-neutral-950/80`, `text-neutral-100`,
  `ring-1`, `backdrop-blur-xl`, `rounded-xl p-1.5`, `max-h-92`), igual que el
  original. Es la excepción consciente al principio #2 de PRODUCT.md: el
  builder repinta el documento con el borrador, y un tema a medio hacer dejaría
  ilegible el propio desplegable que hace falta para escapar de él.
- Ítems de radio con el check a la derecha (`pr-8`), y dos grupos separados por
  una línea: temas propios y de fábrica — el equivalente del corte
  base-colors/themes del original.
- Cae el icono suelto de paleta de la barra: el punto de color dice lo mismo y
  está pegado al valor.

### 1d. Luz de fondo en el panel de la galería

`GALLERY_GLOW` en `index.tsx`: tres focos radiales difusos desde `--primary`,
`--chart-2` y `--chart-4`. Sobre un fondo plano, una tarjeta con `--card`
translúcido se ve igual que una opaca; con luz detrás, el alfa se delata.

Va como `background-image` del contenedor y no como capa `inset-0`: el panel
hace scroll desde `xl` y una capa absoluta se desplazaría con el contenido.
No se usa `--accent` como foco porque es una superficie (0,97 de luminosidad en
los presets claros) y no se distinguía del fondo.

### 2. Autoguardado con indicador continuo

- Segundo fetcher dedicado (`saveFetcher`) para `save-draft`, **sin**
  `useFetcherToast`: se acaban los ~25 toasts.
- Indicador de tres estados junto al selector: `Guardando…` / `Guardado` /
  `No se guardó: <mensaje del servidor>` + **Reintentar**.
- Se conserva el corte del bucle de reintentos (huella `tokensFingerprint` en un
  ref), pero sin el `useState rejected`: la respuesta fallida ya vive en
  `saveFetcher.data` hasta el siguiente envío.

### 3. Una sola superficie en la columna izquierda

`ThemeTokenPanel` y `ContrastPanel` dejan de traer su propia tarjeta; `index.tsx`
las compone dentro de un único `rounded-lg border bg-card` con divisores. Nuevo
primitivo compartido `components/theme-section.tsx` (`ThemeSection`), colapsable
y sin borde propio.

Secciones, de siete a seis:

1. **Colores** (abierta) — Superficies, Marca, Estado · 20 tokens
2. **Colores avanzados** — Bordes y foco, Gráficas, Barra lateral · 16 tokens
3. **Tipografía**
4. **Medidas** — radio, grosor de borde, unidad de espaciado + avisos de densidad
   (fusiona "Radios y bordes" con "Espaciado")
5. **Sombras**
6. **Contraste** — colapsada, con el veredicto en el disparador; al abrir, los
   pares que fallan primero

### 4. `ColorField` sin tarjeta anidada

El área croma×luminosidad, tono, opacidad y el picker nativo se mueven a un
`Popover` anclado al swatch. Elimina la tarjeta dentro de tarjeta y el salto de
layout al abrir un color. El nombre del token se queda en `font-mono`: es
literalmente la variable CSS y el contrato con tweakcn.

### 5. Copia

- Descripción de la página: de dos líneas a una.
- "Derivar oscuro": el párrafo de tres líneas pasa a `Tooltip` del botón.
- Contraste: la leyenda WCAG de cuatro líneas sale del encabezado y pasa dentro
  de la sección plegada; el disparador solo lleva el veredicto.
- Espaciado: se borra el párrafo redundante con la descripción de la sección.
- Tipografía: el párrafo de la escala pasa a hint del propio campo.

## Invariantes que NO se tocan

- `useThemeDraft`: preview en vivo sobre el documento, readopción por huella,
  clase de `<html>` acompañando a la variante, limpieza al desmontar.
- `fieldset disabled` real para presets (no `pointer-events-none opacity-60`).
- El tema abierto sigue viajando en `?tema=<documentId>`.
- Las once intenciones del action, sus validadores y sus mensajes.
- Los rangos de `LENGTH_RANGES` como única fuente de los sliders.

## Verificación

`bun run typecheck` · `bun run lint` · `bun run test` · detector mecánico de
Impeccable sobre los archivos tocados.
